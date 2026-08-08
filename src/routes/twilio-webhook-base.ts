/* eslint-disable @typescript-eslint/no-explicit-any -- vendor webhook payloads are JSON envelopes with provider-specific shapes. */
/**
 * Twilio inbound SMS webhook.
 *
 * Handles three things:
 *   1. STOP / UNSUBSCRIBE / CANCEL / QUIT / END / OPTOUT keywords
 *      → add phone to wireline_dnc_list (TCPA compliance) + log to
 *        wireline_consent_log so we have an audit trail.
 *   2. START / UNSTOP / YES keywords → remove from DNC (opt-back-in).
 *   3. Any other inbound text → just log it for now; future work can
 *      route it to an agent for two-way conversation.
 *
 * Vapi already handles voice; this is the SMS counterpart. The
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
import { sanitizePhone } from "../lib/vapi-helpers";
import { dncPhoneCandidates, normalizeDncPhone } from "../lib/compliance";
import { rateLimit, distributedLimiterStatus } from "../lib/rate-limit";
import { reportError } from "../lib/error-reporter";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { matchesCarrierKeyword } from "../lib/carrier-keywords";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import {
  buildFailoverVoicemailEmail,
  opaqueIdSuffixForLog,
  phoneSuffixForLog,
} from "../lib/twilio-webhook-privacy";
import { complianceFirstMessagePrefix } from "../lib/agent-runtime";

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

type FailoverCompliance = {
  /** Resolved compliance mode of the agent answering this line, if known. */
  complianceMode: string | null;
  businessName: string | null;
};

/**
 * Take-a-message TwiML for the Vapi-outage path.
 *
 * This answers the same tenant line as the full assistant, so it inherits the
 * same obligations. A HIPAA line is never recorded or transcribed. When the
 * compliance posture cannot be resolved, recording also fails closed: losing a
 * voicemail during an outage is preferable to capturing PHI under an unknown
 * policy. Calls that are explicitly known to be non-HIPAA may record only after
 * the same spoken disclosure used by the managed assistant paths.
 */
function failoverVoicemailTwiml(
  includeOutageContext = false,
  compliance: FailoverCompliance = { complianceMode: null, businessName: null },
): string {
  const context = includeOutageContext
    ? `  <Say voice="Polly.Matthew-Neural">Hello, you have reached a Wireline agent line. We are currently experiencing an unexpectedly high volume of calls and our voice systems are temporarily offline.</Say>\n`
    : "";

  const recordingEnabled =
    compliance.complianceMode !== null && compliance.complianceMode !== "hipaa";
  if (!recordingEnabled) {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n` +
      context +
      `  <Say voice="Polly.Matthew-Neural">We are unable to take a message on this line right now. Please call back shortly and a member of the team will assist you. Thank you.</Say>\n` +
      `</Response>`
    );
  }

  const disclosure = escapeTwimlValue(
    complianceFirstMessagePrefix(compliance.complianceMode, compliance.businessName, {
      recordingEnabled: true,
    }),
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n` +
    context +
    `  <Say voice="Polly.Matthew-Neural">${disclosure}Please leave your name, number, and a brief message, and a human agent will return your call as soon as possible. Thank you.</Say>\n` +
    `  <Record maxLength="120" action="/api/twilio-webhook/voicemail-complete" method="POST" transcribe="true" transcribeCallback="/api/twilio-webhook/voicemail-transcription" />\n` +
    `</Response>`
  );
}

/**
 * Compliance posture for the line a failover call arrived on. Resolved through
 * wireline_phone_numbers.agent_id -> wireline_agents.compliance_mode, the same
 * chain inbound routing uses. Unknown stays unknown so the TwiML builder can
 * fail closed rather than silently assuming recording is allowed.
 */
async function resolveFailoverCompliance(to: string | null): Promise<FailoverCompliance> {
  const unknown: FailoverCompliance = { complianceMode: null, businessName: null };
  if (!to) return unknown;
  try {
    const [row] = await drizzle
      .select({
        complianceMode: schema.agents.complianceMode,
        businessName: schema.settings.businessName,
      })
      .from(schema.phoneNumbers)
      .leftJoin(schema.agents, eq(schema.agents.id, schema.phoneNumbers.agentId))
      .leftJoin(schema.settings, eq(schema.settings.userId, schema.phoneNumbers.userId))
      // Match lookupTenant's normalization: a To variant that resolves the
      // tenant but missed this lookup would fail closed and refuse voicemail
      // for a non-HIPAA tenant during every failover.
      .where(eq(schema.phoneNumbers.phoneNumber, sanitizePhone(to)))
      .limit(1);
    return {
      complianceMode: row?.complianceMode ?? null,
      businessName: row?.businessName ?? null,
    };
  } catch (error) {
    log.error("Failover compliance lookup failed; recording disabled", {
      error: error instanceof Error ? error.message : String(error),
      to_suffix: phoneSuffixForLog(to),
    });
    return unknown;
  }
}

function publicAssetUrl(pathname: string): string {
  const canonical = resolveCanonicalAppUrl();
  const baseUrl = "error" in canonical ? "https://trywireline.com" : canonical.url;
  return new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function validE164(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^\+[1-9]\d{7,14}$/.test(candidate) ? candidate : null;
}

function verifyTwilioSignature(req: Request): boolean {
  return evaluateTwilioWebhookAuth(req).ok;
}

async function lookupTenant(toNumber: string): Promise<string | null> {
  const normalized = sanitizePhone(toNumber);
  const [byPhone] = await drizzle
    .select({ userId: schema.phoneNumbers.userId })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, normalized))
    .limit(1);
  if (byPhone?.userId) return byPhone.userId as string;

  const [bySender] = await drizzle
    .select({ userId: schema.settings.userId })
    .from(schema.settings)
    .where(eq(schema.settings.twilioSmsFromNumber, normalized))
    .limit(1);
  if (bySender?.userId) return bySender.userId as string;

  return null;
}

router.post("/api/twilio-webhook/sms", async (req: Request, res: Response) => {
  const auth = evaluateTwilioWebhookAuth(req);
  if (!auth.ok) {
    if (
      !process.env.TWILIO_AUTH_TOKEN &&
      (process.env.NODE_ENV === "production" || process.env.VERCEL === "1")
    ) {
      log.error("TWILIO_AUTH_TOKEN not configured in production — rejecting webhook");
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

  log.info("Twilio inbound SMS", {
    from_suffix: phoneSuffixForLog(from),
    to_suffix: phoneSuffixForLog(to),
    body_length: body.length,
    message_sid_suffix: opaqueIdSuffixForLog(messageSid),
  });

  res.setHeader("Content-Type", "text/xml");
  if (!from || !to) return res.status(400).send(twimlEmpty());

  const tenantUserId = await lookupTenant(to);
  if (!tenantUserId) {
    log.warn("Twilio webhook: unknown To-number", { to_suffix: phoneSuffixForLog(to) });
    return res.status(200).send(twimlEmpty());
  }

  const fromNormalized = sanitizePhone(from);

  return tenantStore.run(tenantUserId, async () => {
    if (matchesCarrierKeyword(trimmed, OPT_OUT_KEYWORDS)) {
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
            twimlReply(
              "We couldn't process your unsubscribe request just now. Please reply STOP again in a few minutes.",
            ),
          );
      }

      return res
        .status(200)
        .send(
          twimlReply(
            "You have been unsubscribed. You will not receive any more messages from this number. Reply START to opt back in.",
          ),
        );
    }

    if (matchesCarrierKeyword(trimmed, OPT_IN_KEYWORDS)) {
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

        log.info("SMS opt-in processed", {
          tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
          from_suffix: phoneSuffixForLog(fromNormalized),
        });
      } catch (e: any) {
        log.error("SMS opt-in write failed", { error: e?.message });
        return res
          .status(200)
          .send(
            twimlReply(
              "We couldn't process your resubscribe request just now. Please reply START again in a few minutes.",
            ),
          );
      }

      return res.status(200).send(twimlReply("You have been resubscribed. Welcome back."));
    }

    if (matchesCarrierKeyword(trimmed, HELP_KEYWORDS)) {
      return res
        .status(200)
        .send(
          twimlReply(
            "Wireline SMS help: reply STOP to opt out or START to opt back in. Contact support@trywireline.com for support. Message and data rates may apply.",
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
      await drizzle.transaction(async (tx) => {
        // Establish the conversation row without racing another first message.
        // A conflicting insert is expected when two messages arrive together;
        // the unique (user_id, customer_number) index selects the canonical row.
        const [createdThread] = await tx
          .insert(schema.smsThreads)
          .values({ userId: tenantUserId, customerNumber: fromNormalized, unreadCount: 0 })
          .onConflictDoNothing({ target: [schema.smsThreads.userId, schema.smsThreads.customerNumber] })
          .returning({ id: schema.smsThreads.id });

        const [thread] = createdThread
          ? [createdThread]
          : await tx
              .select({ id: schema.smsThreads.id })
              .from(schema.smsThreads)
              .where(
                and(
                  eq(schema.smsThreads.userId, tenantUserId),
                  eq(schema.smsThreads.customerNumber, fromNormalized),
                ),
              )
              .limit(1);
        if (!thread?.id) throw new Error("SMS thread could not be resolved after insert conflict");

        // Let the provider SID unique index arbitrate concurrent webhook retries.
        // Only the transaction that actually persists the message increments the
        // unread counter, preventing both duplicate over-counts and lost updates.
        const [insertedMessage] = await tx
          .insert(schema.smsMessages)
          .values({
            userId: tenantUserId,
            threadId: thread.id,
            direction: "in",
            body,
            twilioSid: messageSid || null,
          })
          .onConflictDoNothing()
          .returning({ id: schema.smsMessages.id });
        if (!insertedMessage) return;

        await tx
          .update(schema.smsThreads)
          .set({
            lastMessageAt: new Date(),
            unreadCount: sql`coalesce(${schema.smsThreads.unreadCount}, 0) + 1`,
            status: "open",
          })
          .where(
            and(
              eq(schema.smsThreads.id, thread.id),
              eq(schema.smsThreads.userId, tenantUserId),
            ),
          );
      });
    } catch (e: any) {
      // Provisioned Messaging URLs opt into 5xx retries. Combined with the
      // provider-SID unique index above, a transient database failure becomes
      // retry-safe at-least-once delivery instead of an acknowledged data loss.
      log.error("Inbound SMS persist failed — requesting Twilio redelivery", {
        error: e?.message,
      });
      return res.status(503).send(twimlEmpty());
    }

    return res.status(200).send(twimlEmpty());
  });
});

router.post("/api/twilio-webhook/voice-fallback", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlEmpty());
  }

  const to = (req.body?.To as string | undefined) || "";
  const from = (req.body?.From as string | undefined) || "";
  log.error("VAPI FAILOVER TRIGGERED", {
    to_suffix: phoneSuffixForLog(to),
    from_suffix: phoneSuffixForLog(from),
  });

  let fallbackNumber: string | null = null;
  try {
    const tenantUserId = await lookupTenant(to);
    if (tenantUserId) {
      const [settings] = await drizzle
        .select({ humanFallbackNumber: schema.settings.twilioManagerAlertNumber })
        .from(schema.settings)
        .where(eq(schema.settings.userId, tenantUserId))
        .limit(1);
      fallbackNumber = validE164(settings?.humanFallbackNumber);
      if (settings?.humanFallbackNumber && !fallbackNumber) {
        log.warn("Failover number is not valid E.164; degrading to voicemail", {
          tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
        });
      }
    }
  } catch (error) {
    log.error("Failover tenant lookup failed; degrading to voicemail", {
      error: error instanceof Error ? error.message : String(error),
      to_suffix: phoneSuffixForLog(to),
    });
  }

  const transferChimeUrl = publicAssetUrl("/sounds/wireline-transfer-chime.wav");

  if (fallbackNumber) {
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n`;
    twiml += `  <Say voice="Polly.Matthew-Neural">Hello, you have reached a Wireline agent line. We are currently experiencing an unexpectedly high volume of calls and our voice systems are temporarily offline.</Say>\n`;
    twiml += `  <Say voice="Polly.Matthew-Neural">Please hold while we transfer you to an available team member.</Say>\n`;
    twiml += `  <Play>${escapeTwimlValue(transferChimeUrl)}</Play>\n`;
    twiml += `  <Dial answerOnBridge="true" action="/api/twilio-webhook/voice-fallback-complete" method="POST">${escapeTwimlValue(fallbackNumber)}</Dial>\n`;
    twiml += `</Response>`;
    return res.status(200).send(twiml);
  }

  return res.status(200).send(failoverVoicemailTwiml(true, await resolveFailoverCompliance(to)));
});

router.post("/api/twilio-webhook/voice-fallback-complete", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/xml");
  if (!verifyTwilioSignature(req)) {
    log.warn("Twilio webhook signature verification failed", { path: req.path });
    return res.status(403).send(twimlHangup());
  }

  const dialStatus =
    typeof req.body?.DialCallStatus === "string"
      ? req.body.DialCallStatus.trim().toLowerCase()
      : "unknown";
  log.info("Voice failover transfer completed", { dial_status: dialStatus });

  if (dialStatus === "completed") return res.status(200).send(twimlHangup());

  const to = typeof req.body?.To === "string" ? req.body.To : "";
  return res.status(200).send(failoverVoicemailTwiml(false, await resolveFailoverCompliance(to)));
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
          summary: "Voicemail left during voice failover (Vapi unavailable).",
          outcomeTag: "voicemail",
          intentLabel: "voicemail",
        })
        .onConflictDoNothing({ target: schema.callLogs.vapiCallId })
        .returning({ id: schema.callLogs.id });

      if (!inserted) {
        log.info("Duplicate Twilio voicemail callback ignored", {
          recording_sid_suffix: opaqueIdSuffixForLog(recordingSid),
        });
        return false;
      }

      try {
        const [owner] = await drizzle
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, tenantUserId))
          .limit(1);
        if (owner?.email) {
          const { sendEmail } = await import("../lib/email-service");
          const voicemailEmail = buildFailoverVoicemailEmail({
            from,
            to,
            durationSeconds,
            recordingUrl: publicAssetUrl(`/api/calls/${String(inserted.id)}/recording`),
            transcription,
          });
          const notification = await Promise.race([
            sendEmail({
              to: owner.email,
              subject: "Wireline: voicemail left during call failover",
              ...voicemailEmail,
            }).then((result) => ({ state: "settled" as const, result })),
            new Promise<{ state: "timed_out" }>((resolve) => {
              const timer = setTimeout(() => resolve({ state: "timed_out" }), 3_000);
              timer.unref?.();
            }),
          ]);
          if (notification.state === "timed_out") {
            log.warn("Voicemail owner notify exceeded webhook budget");
          } else if (!notification.result.ok) {
            log.warn("Voicemail owner notify was not accepted", {
              provider: notification.result.provider,
              error: notification.result.error,
            });
          }
        }
      } catch (notifyErr) {
        log.warn("Voicemail owner notify failed", {
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }
      return true;
    });

    if (!persisted) return res.status(200).send(twimlHangup());

    log.info("Voicemail persisted during Vapi failover", {
      tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
      from_suffix: phoneSuffixForLog(from),
      to_suffix: phoneSuffixForLog(to),
      has_recording: true,
      has_transcript: Boolean(transcription),
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
  log.info("Singing receptionist demo line hit", { from_suffix: phoneSuffixForLog(from) });

  // This is a public, provider-billed showcase number. Cap repeat callers before
  // bridging to Vapi and fail closed when the distributed limiter is unhealthy;
  // returning TwiML 200 avoids carrier webhook retries while still protecting spend.
  const limiter = distributedLimiterStatus();
  if (!limiter.ok) {
    log.error("Singing receptionist disabled: distributed rate limiter unavailable", {
      reason: limiter.reason,
    });
    return res.status(200).send(twimlHangup());
  }
  try {
    const demoRate = await rateLimit(sanitizePhone(from) || from || "unknown", {
      bucket: "public_singing_demo",
      windowMs: 60 * 60 * 1000,
      max: 3,
      failClosedOnError: true,
    });
    if (!demoRate.allowed) {
      log.warn("Singing receptionist caller rate-limited", {
        from_suffix: phoneSuffixForLog(from),
      });
      return res.status(200).send(twimlHangup());
    }
  } catch (error) {
    log.error("Singing receptionist rate limiter failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(200).send(twimlHangup());
  }

  const jingleUrl = publicAssetUrl("/sounds/wireline-jingle.mp3");
  const sipUri = process.env.SINGING_VAPI_SIP_URI || "";

  let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n`;
  twiml += `  <Play>${escapeTwimlValue(jingleUrl)}</Play>\n`;
  if (sipUri) {
    // Twilio <Dial> defaults to a four-hour maximum. A five-minute demo cap and
    // short ring timeout prevent a forgotten/abusive public call from turning
    // into an unbounded Twilio + Vapi session.
    twiml += `  <Dial answerOnBridge="true" timeout="20" timeLimit="300"><Sip>${escapeTwimlValue(sipUri)}</Sip></Dial>\n`;
  } else {
    twiml += `  <Say voice="Polly.Joanna-Neural">Haha, sorry about that. We like to have fun at Wireline sometimes. To finish setting up this demo, configure the SINGING_VAPI_SIP_URI environment variable. Goodbye.</Say>\n`;
    twiml += `  <Hangup/>\n`;
  }
  twiml += `</Response>`;

  return res.status(200).send(twiml);
});

export default router;
