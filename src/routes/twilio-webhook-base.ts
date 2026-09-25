/* eslint-disable @typescript-eslint/no-explicit-any -- vendor webhook payloads are JSON envelopes with provider-specific shapes. */
/**
 * Twilio inbound SMS webhook.
 *
 * Handles three things:
 *   1. STOP / UNSUBSCRIBE / CANCEL / QUIT / END / OPTOUT keywords
 *      → add phone to wireline_dnc_list (TCPA compliance) + log to
 *        wireline_consent_log so we have an audit trail.
 *   2. START / UNSTOP / YES keywords → remove from DNC (opt-back-in).
 *   3. Any other inbound text → persist it and bind the conversation to the
 *      Bot assigned to the destination line. OpenAI reply intelligence is
 *      requested from the authenticated inbox; Twilio remains the only
 *      carrier and send boundary.
 *
 * OpenAI Realtime handles conversation audio over Twilio SIP; this is the SMS counterpart. The
 * outbound side (sending texts FROM Wireline) is already wired in
 * twilio-service.sendTenantMessage; this completes the round-trip.
 *
 * Twilio expects:
 *   POST application/x-www-form-urlencoded with fields:
 *     From, To, Body, MessageSid, AccountSid, ...
 *   Response: TwiML XML (or empty 200) — we return TwiML when we
 *     want to send an auto-reply (e.g. "you have been unsubscribed").
 */

import { Router, Request, Response } from "express";
import { createHash } from "node:crypto";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import { sanitizePhone } from "../lib/agent-runtime-helpers";
import { smsOutcomeAfterMessage } from "../lib/sms-thread-outcome";
import { dncPhoneCandidates, normalizeDncPhone } from "../lib/compliance";
import { reportError } from "../lib/error-reporter";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { matchesCarrierKeyword } from "../lib/carrier-keywords";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import {
  buildFailoverVoicemailEmail,
  opaqueIdSuffixForLog,
  phoneSuffixForLog,
} from "../lib/twilio-webhook-privacy";
import { resolveTwilioInboundEnvironment } from "../lib/twilio-inbound-environment";

const router = Router();

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "optout",
  "opt-out",
  "opt out",
]);

const OPT_IN_KEYWORDS = new Set(["start", "unstop", "yes", "optin", "opt-in", "opt in"]);

const HELP_KEYWORDS = new Set(["help", "info", "support"]);

function twimlReply(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

function escapeTwimlValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twimlHangup(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
}

function publicAssetUrl(pathname: string): string {
  const canonical = resolveCanonicalAppUrl();
  const baseUrl = "error" in canonical ? "https://botbound.app" : canonical.url;
  return new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function validE164(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

function verifyTwilioSignature(req: Request): boolean {
  return evaluateTwilioWebhookAuth(req).ok;
}

export type InboundMessagingDestination = {
  userId: string;
  agentId: string | null;
  destinationNumber: string;
};

export async function lookupMessagingDestination(
  toNumber: string,
): Promise<InboundMessagingDestination | null> {
  const normalized = sanitizePhone(toNumber.replace(/^whatsapp:/i, ""));
  if (!normalized) return null;
  const [byPhone] = await drizzle
    .select({ userId: schema.phoneNumbers.userId, agentId: schema.phoneNumbers.agentId })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, normalized))
    .limit(1);
  if (byPhone?.userId) {
    return {
      userId: byPhone.userId as string,
      agentId: byPhone.agentId || null,
      destinationNumber: normalized,
    };
  }

  const [bySender] = await drizzle
    .select({ userId: schema.settings.userId })
    .from(schema.settings)
    .where(
      or(
        eq(schema.settings.twilioSmsFromNumber, normalized),
        eq(schema.settings.twilioWhatsappFromNumber, normalized),
      ),
    )
    .limit(1);
  if (bySender?.userId) {
    return {
      userId: bySender.userId as string,
      agentId: null,
      destinationNumber: normalized,
    };
  }

  return null;
}

async function lookupTenant(toNumber: string): Promise<string | null> {
  return (await lookupMessagingDestination(toNumber))?.userId ?? null;
}

async function resolveProductionInboundTenant(
  toNumber: string,
  route: string,
): Promise<string | null> {
  try {
    const tenantUserId = toNumber ? await lookupTenant(toNumber) : null;
    if (!tenantUserId) {
      log.warn("Signed Twilio inbound callback has no tenant", {
        route,
        to_suffix: phoneSuffixForLog(toNumber),
      });
      return null;
    }
    const decision = await resolveTwilioInboundEnvironment(tenantUserId);
    if (!decision.allowed) {
      log.warn("Signed Twilio inbound media suppressed by account environment", {
        route,
        tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
        account_environment: decision.environment ?? "missing",
        code: decision.code,
      });
      return null;
    }
    return tenantUserId;
  } catch (error) {
    log.error("Signed Twilio inbound tenant lookup failed closed", {
      route,
      to_suffix: phoneSuffixForLog(toNumber),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

router.post("/api/twilio-webhook/sms", async (req: Request, res: Response) => {
  const auth = evaluateTwilioWebhookAuth(req);
  if (!auth.ok) {
    if (
      !process.env.TWILIO_AUTH_TOKEN &&
      (process.env.NODE_ENV === "production" || process.env.VERCEL === "1")
    ) {
      log.error("TWILIO_AUTH_TOKEN not configured in production, rejecting webhook");
    } else {
      log.warn("Twilio webhook signature verification failed", { path: req.path });
    }
    return res.status(403).send(twimlEmpty());
  }

  const from = (req.body?.From as string | undefined) || "";
  const to = (req.body?.To as string | undefined) || "";
  const body = (req.body?.Body as string | undefined) || "";
  const messageSid = (req.body?.MessageSid as string | undefined) || "";
  const trimmed = body.trim().toLowerCase();
  const isOptOut = matchesCarrierKeyword(trimmed, OPT_OUT_KEYWORDS);
  const isOptIn = matchesCarrierKeyword(trimmed, OPT_IN_KEYWORDS, "exact");
  const isHelp = matchesCarrierKeyword(trimmed, HELP_KEYWORDS, "exact");

  log.info("Twilio inbound SMS", {
    from_suffix: phoneSuffixForLog(from),
    to_suffix: phoneSuffixForLog(to),
    body_length: body.length,
    message_sid_suffix: opaqueIdSuffixForLog(messageSid),
  });
  res.setHeader("Content-Type", "text/xml");
  if (!from || !to) return res.status(400).send(twimlEmpty());

  const destination = await lookupMessagingDestination(to);
  if (!destination) {
    log.warn("Twilio webhook: unknown To-number", { to_suffix: phoneSuffixForLog(to) });
    return res.status(200).send(twimlEmpty());
  }
  const tenantUserId = destination.userId;

  const fromNormalized = sanitizePhone(from);
  const replyEnvironment =
    isOptOut || isOptIn || isHelp ? await resolveTwilioInboundEnvironment(tenantUserId) : null;
  if (replyEnvironment && !replyEnvironment.allowed) {
    log.warn("Signed Twilio inbound SMS reply suppressed by account environment", {
      tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
      account_environment: replyEnvironment.environment ?? "missing",
      code: replyEnvironment.code,
    });
  }
  const appReply = (message: string): string =>
    replyEnvironment?.allowed ? twimlReply(message) : twimlEmpty();

  return tenantStore.run(tenantUserId, async () => {
    if (isOptOut) {
      try {
        await drizzle
          .insert(schema.dncList)
          .values({
            userId: tenantUserId,
            phone: normalizeDncPhone(from),
            phoneRaw: from,
            reason: "opt-out",
            source: "sms_opt_out",
          })
          .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });

        await drizzle.insert(schema.consentLog).values({
          userId: tenantUserId,
          customerNumber: fromNormalized,
          event: "sms_opt_out",
          rule: "stop_keyword",
          ruleVersion: "v1",
          state: "opted_out",
        });

        await drizzle.transaction(async (tx) =>
          persistInboundSmsEvidence(tx, {
            userId: tenantUserId,
            agentId: destination.agentId,
            destinationNumber: destination.destinationNumber,
            customerNumber: fromNormalized,
            body,
            messageSid,
          }),
        );

        log.info("SMS opt-out processed", {
          tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
          from_suffix: phoneSuffixForLog(fromNormalized),
        });
      } catch (e: any) {
        log.error("SMS opt-out write failed", { error: e?.message });
        reportError(e instanceof Error ? e : new Error(String(e?.message || e)), {
          route: "/api/twilio-webhook/sms",
          flow: "sms_opt_out",
          tenant: opaqueIdSuffixForLog(tenantUserId),
        });
        return res
          .status(200)
          .send(
            appReply(
              "We couldn't process your unsubscribe request just now. Please reply STOP again in a few minutes.",
            ),
          );
      }

      return res
        .status(200)
        .send(
          appReply(
            "You have been unsubscribed. You will not receive any more messages from this number. Reply START to opt back in.",
          ),
        );
    }

    // Exact only — see matchesCarrierKeyword. A leading-word match on an
    // ordinary reply ("Yes please, 3pm works", "Help me reschedule") would
    // fabricate a consent event. Control messages are still stored as inbox
    // evidence before this handler returns its environment-gated reply.
    if (isOptIn) {
      try {
        await drizzle
          .delete(schema.dncList)
          .where(
            and(
              eq(schema.dncList.userId, tenantUserId),
              inArray(schema.dncList.phone, dncPhoneCandidates(from)),
              eq(schema.dncList.reason, "opt-out"),
              or(
                eq(schema.dncList.source, "twilio_advanced_opt_out"),
                eq(schema.dncList.source, "sms_opt_out"),
              ),
            ),
          );

        await drizzle.insert(schema.consentLog).values({
          userId: tenantUserId,
          customerNumber: fromNormalized,
          event: "sms_opt_in",
          rule: "start_keyword",
          ruleVersion: "v1",
          state: "opted_in",
        });

        await drizzle.transaction(async (tx) =>
          persistInboundSmsEvidence(tx, {
            userId: tenantUserId,
            agentId: destination.agentId,
            destinationNumber: destination.destinationNumber,
            customerNumber: fromNormalized,
            body,
            messageSid,
          }),
        );

        log.info("SMS opt-in processed", {
          tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
          from_suffix: phoneSuffixForLog(fromNormalized),
        });
      } catch (e: any) {
        log.error("SMS opt-in write failed", { error: e?.message });
        return res
          .status(200)
          .send(
            appReply(
              "We couldn't process your resubscribe request just now. Please reply START again in a few minutes.",
            ),
          );
      }

      return res.status(200).send(appReply("You have been resubscribed. Welcome back."));
    }

    if (isHelp) {
      try {
        await drizzle.transaction(async (tx) =>
          persistInboundSmsEvidence(tx, {
            userId: tenantUserId,
            agentId: destination.agentId,
            destinationNumber: destination.destinationNumber,
            customerNumber: fromNormalized,
            body,
            messageSid,
          }),
        );
      } catch (e: any) {
        log.error("Inbound SMS HELP evidence persist failed, requesting Twilio redelivery", {
          error: e?.message,
        });
        return res.status(503).send(twimlEmpty());
      }
      return res
        .status(200)
        .send(
          appReply(
            "BotBound SMS help: reply STOP to opt out or START to opt back in. Contact support@botbound.app for support. Message and data rates may apply.",
          ),
        );
    }

    if (/^\s*[1-5]\s*$/.test(body)) {
      try {
        const { processCsatReply } = await import("../lib/csat-service");
        await processCsatReply({
          userId: tenantUserId,
          customerNumber: fromNormalized,
          score: parseInt(trimmed, 10),
        });
      } catch (e: any) {
        log.warn("CSAT reply processing failed", { error: e?.message });
      }
    }

    try {
      await drizzle.transaction(async (tx) =>
        persistInboundSmsEvidence(tx, {
          userId: tenantUserId,
          agentId: destination.agentId,
          destinationNumber: destination.destinationNumber,
          customerNumber: fromNormalized,
          body,
          messageSid,
        }),
      );
    } catch (e: any) {
      // Provisioned Messaging URLs opt into 5xx retries. Combined with the
      // provider-SID unique index above, a transient database failure becomes
      // retry-safe at-least-once delivery instead of an acknowledged data loss.
      log.error("Inbound SMS persist failed, requesting Twilio redelivery", {
        error: e?.message,
      });
      return res.status(503).send(twimlEmpty());
    }

    return res.status(200).send(twimlEmpty());
  });
});

export async function persistInboundSmsEvidence(
  tx: typeof drizzle,
  input: {
    userId: string;
    agentId?: string | null;
    destinationNumber: string;
    customerNumber: string;
    body: string;
    messageSid: string;
  },
): Promise<void> {
  // Establish the conversation row without racing another first message. A
  // conflicting insert is expected when two messages arrive together; the
  // unique tenant + exact destination + customer index selects the canonical
  // row without merging separate Bot lines.
  const [createdThread] = await tx
    .insert(schema.smsThreads)
    .values({
      userId: input.userId,
      agentId: input.agentId || null,
      destinationNumber: input.destinationNumber,
      customerNumber: input.customerNumber,
      unreadCount: 0,
    })
    .onConflictDoNothing()
    .returning({
      id: schema.smsThreads.id,
      status: schema.smsThreads.status,
    });

  const [thread] = createdThread
    ? [createdThread]
    : await tx
        .select({
          id: schema.smsThreads.id,
          status: schema.smsThreads.status,
        })
        .from(schema.smsThreads)
        .where(
          and(
            eq(schema.smsThreads.userId, input.userId),
            eq(schema.smsThreads.destinationNumber, input.destinationNumber),
            eq(schema.smsThreads.customerNumber, input.customerNumber),
          ),
        )
        .limit(1);
  if (!thread?.id) throw new Error("SMS thread could not be resolved after insert conflict");

  // Let the provider SID unique index arbitrate concurrent webhook retries.
  // Only the transaction that persists the message increments unread state.
  const [insertedMessage] = await tx
    .insert(schema.smsMessages)
    .values({
      userId: input.userId,
      threadId: thread.id,
      direction: "in",
      body: input.body,
      twilioSid: input.messageSid || null,
    })
    .onConflictDoNothing()
    .returning({ id: schema.smsMessages.id });
  if (!insertedMessage) return;

  await tx
    .update(schema.smsThreads)
    .set({
      lastMessageAt: new Date(),
      unreadCount: sql`coalesce(${schema.smsThreads.unreadCount}, 0) + 1`,
      // New evidence must not silently undo an account-holder-owned outcome.
      // In particular, `escalated` is paired with an active human-handoff task
      // in Approvals. Reopening is an explicit operator action in the inbox.
      status: smsOutcomeAfterMessage(schema.smsThreads.status),
      // The exact destination line is the assignment source of truth. Project
      // null too so a released/unassigned line cannot keep using a stale Bot.
      agentId: input.agentId ?? null,
    })
    .where(and(eq(schema.smsThreads.id, thread.id), eq(schema.smsThreads.userId, input.userId)));
}

export async function handleTwilioVoiceFallback(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlEmpty());
  }

  const to = (req.body?.To as string | undefined) || "";
  const from = (req.body?.From as string | undefined) || "";
  const tenantUserId = await resolveProductionInboundTenant(to, req.path);
  if (!tenantUserId) return res.status(200).send(twimlHangup());

  log.error("VOICE FAILOVER TRIGGERED", {
    to_suffix: phoneSuffixForLog(to),
    from_suffix: phoneSuffixForLog(from),
  });

  let fallbackNumber: string | null = null;
  try {
    const [settings] = await drizzle
      .select({ humanFallbackNumber: schema.settings.twilioManagerAlertNumber })
      .from(schema.settings)
      .where(eq(schema.settings.userId, tenantUserId))
      .limit(1);
    fallbackNumber = validE164(settings?.humanFallbackNumber);
    if (settings?.humanFallbackNumber && !fallbackNumber) {
      log.warn("Failover number is not valid E.164; hanging up", {
        tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
      });
    }
  } catch (error) {
    log.error("Failover settings lookup failed; hanging up", {
      error: error instanceof Error ? error.message : String(error),
      to_suffix: phoneSuffixForLog(to),
    });
  }

  const transferChimeUrl = publicAssetUrl("/sounds/wireline-transfer-chime.wav");

  if (fallbackNumber) {
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n`;
    twiml += `  <Play>${escapeTwimlValue(transferChimeUrl)}</Play>\n`;
    twiml += `  <Dial answerOnBridge="true" action="/api/twilio-webhook/voice-fallback-complete" method="POST">${escapeTwimlValue(fallbackNumber)}</Dial>\n`;
    twiml += `</Response>`;
    return res.status(200).send(twiml);
  }

  return res.status(200).send(twimlHangup());
}

router.post("/api/twilio-webhook/voice-fallback", handleTwilioVoiceFallback);

router.post("/api/twilio-webhook/voice-fallback-complete", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlHangup());
  }

  const to = typeof req.body?.To === "string" ? req.body.To : "";
  const tenantUserId = await resolveProductionInboundTenant(to, req.path);
  if (!tenantUserId) return res.status(200).send(twimlHangup());

  const dialStatus =
    typeof req.body?.DialCallStatus === "string"
      ? req.body.DialCallStatus.trim().toLowerCase()
      : "unknown";
  log.info("Voice failover transfer completed", { dial_status: dialStatus });

  return res.status(200).send(twimlHangup());
});

router.post("/api/twilio-webhook/voicemail-complete", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlHangup());
  }

  const recordingUrl =
    typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl.trim() : "";
  const recordingSid =
    typeof req.body?.RecordingSid === "string" ? req.body.RecordingSid.trim() : "";
  const transcription =
    typeof req.body?.TranscriptionText === "string" ? req.body.TranscriptionText.trim() : "";
  const from = typeof req.body?.From === "string" ? req.body.From : "";
  const to = typeof req.body?.To === "string" ? req.body.To : "";
  const durationRaw = Number(req.body?.RecordingDuration);
  const durationSeconds = Number.isFinite(durationRaw)
    ? Math.max(0, Math.round(durationRaw))
    : null;

  if (!recordingUrl) {
    log.warn("Voicemail complete missing RecordingUrl", {
      from_suffix: phoneSuffixForLog(from),
      to_suffix: phoneSuffixForLog(to),
    });
    return res.status(200).send(twimlHangup());
  }

  try {
    const tenantUserId = to ? await lookupTenant(to) : null;
    if (!tenantUserId) {
      log.warn("Voicemail recorded but no tenant matched To number", {
        to_suffix: phoneSuffixForLog(to),
        from_suffix: phoneSuffixForLog(from),
      });
      return res.status(200).send(twimlHangup());
    }

    const persisted = await tenantStore.run(tenantUserId, async () => {
      const recordingKey = createHash("sha256")
        .update(recordingSid || recordingUrl)
        .digest("hex");
      const [inserted] = await drizzle
        .insert(schema.callLogs)
        .values({
          userId: tenantUserId,
          vapiCallId: `twilio-voicemail:${recordingKey}`,
          direction: "inbound",
          customerNumber: from ? sanitizePhone(from) || from : null,
          durationSeconds,
          recordingUrl,
          transcript: transcription || null,
          summary: "Voicemail left during BotBound call failover.",
          outcomeTag: "voicemail",
          intentLabel: "voicemail",
        })
        .onConflictDoNothing({ target: schema.callLogs.vapiCallId })
        .returning({ id: schema.callLogs.id });

      const [existing] = inserted
        ? [inserted]
        : await drizzle
            .select({ id: schema.callLogs.id })
            .from(schema.callLogs)
            .where(eq(schema.callLogs.vapiCallId, `twilio-voicemail:${recordingKey}`))
            .limit(1);
      const voicemail = inserted ?? existing;
      if (!voicemail) {
        throw new Error("Voicemail insert conflicted but the persisted call could not be loaded");
      }
      if (!inserted) {
        log.info("Duplicate Twilio voicemail callback reusing persisted call", {
          recording_sid_suffix: opaqueIdSuffixForLog(recordingSid),
        });
      }

      const [owner] = await drizzle
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, tenantUserId))
        .limit(1);
      if (owner?.email) {
        const { sendTenantEmail } = await import("../lib/email-service");
        const voicemailEmail = buildFailoverVoicemailEmail({
          from,
          to,
          durationSeconds,
          recordingUrl: publicAssetUrl(`/api/calls/${String(voicemail.id)}/recording`),
          transcription,
        });
        const notification = await sendTenantEmail({
          userId: tenantUserId,
          action: "voicemail_failover_owner_notification",
          to: owner.email,
          subject: "BotBound: voicemail left during call failover",
          ...voicemailEmail,
          idempotencyKey: `voicemail-failover/${recordingKey}`,
        });
        if (!notification.ok && notification.disposition !== "suppressed") {
          throw new Error(notification.error || "Voicemail owner notification was not accepted");
        }
        if (notification.disposition === "suppressed") {
          log.warn("Voicemail owner notification suppressed", {
            provider: notification.provider,
          });
        }
      }
      return { inserted: Boolean(inserted) };
    });

    log.info("Voicemail persisted during voice failover", {
      tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
      from_suffix: phoneSuffixForLog(from),
      to_suffix: phoneSuffixForLog(to),
      has_recording: true,
      has_transcript: Boolean(transcription),
      duplicate_callback: !persisted.inserted,
    });
    return res.status(200).send(twimlHangup());
  } catch (err) {
    log.error("Failed to persist failover voicemail", {
      error: err instanceof Error ? err.message : String(err),
      from_suffix: phoneSuffixForLog(from),
      to_suffix: phoneSuffixForLog(to),
      has_recording: Boolean(recordingUrl),
    });
    return res.status(503).send(twimlHangup());
  }
});

router.post("/api/twilio-webhook/voicemail-transcription", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlHangup());
  }

  const recordingSid =
    typeof req.body?.RecordingSid === "string" ? req.body.RecordingSid.trim() : "";
  const status =
    typeof req.body?.TranscriptionStatus === "string"
      ? req.body.TranscriptionStatus.trim().toLowerCase()
      : "";
  const transcription =
    typeof req.body?.TranscriptionText === "string" ? req.body.TranscriptionText.trim() : "";
  const to = typeof req.body?.To === "string" ? req.body.To : "";

  if (status !== "completed" || !transcription || !recordingSid || !to) {
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  }

  try {
    const tenantUserId = await lookupTenant(to);
    if (!tenantUserId) {
      return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    }
    // The recording-complete handler keys the call log on RecordingSid when
    // present, else RecordingUrl. Match both candidates so a sid-less recording
    // callback followed by a sid-bearing transcription callback still lands.
    const recordingUrl =
      typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl.trim() : "";
    const candidateCallIds = [...new Set([recordingSid, recordingUrl].filter(Boolean))].map(
      (value) => `twilio-voicemail:${createHash("sha256").update(value).digest("hex")}`,
    );
    await tenantStore.run(tenantUserId, async () => {
      await drizzle
        .update(schema.callLogs)
        .set({ transcript: transcription })
        .where(
          and(
            inArray(schema.callLogs.vapiCallId, candidateCallIds),
            eq(schema.callLogs.userId, tenantUserId),
          ),
        );
    });
    log.info("Failover voicemail transcript persisted", {
      tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
      recording_sid_suffix: opaqueIdSuffixForLog(recordingSid),
    });
  } catch (err) {
    log.warn("Failed to persist failover voicemail transcript", {
      error: err instanceof Error ? err.message : String(err),
      recording_sid_suffix: opaqueIdSuffixForLog(recordingSid),
    });
  }
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response/>');
});

router.post("/api/twilio-webhook/singing-receptionist", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlEmpty());
  }
  const from = (req.body?.From as string | undefined) || "";
  log.info("Retired singing receptionist route hit", {
    from_suffix: phoneSuffixForLog(from),
  });
  // Keep a signed compatibility sink so any Twilio number that has not yet
  // been detached receives a final 200 response without retrying or creating
  // a provider-billed OpenAI/Twilio bridge.
  return res.status(200).send(twimlHangup());
});

export default router;
