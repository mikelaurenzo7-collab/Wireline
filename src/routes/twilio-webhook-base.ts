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
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import { sanitizePhone } from "../lib/vapi-helpers";
import { dncPhoneCandidates, normalizeDncPhone } from "../lib/compliance";
import { reportError } from "../lib/error-reporter";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { matchesCarrierKeyword } from "../lib/carrier-keywords";
import {
  buildFailoverVoicemailEmail,
  opaqueIdSuffixForLog,
  phoneSuffixForLog,
} from "../lib/twilio-webhook-privacy";

const router = Router();
const twilioVoiceRateLimiter = createIpRateLimiter({
  bucket: "webhook:twilio:voice",
  windowMs: 60_000,
  max: 120,
  message: { error: "Too many voice callbacks. Please retry later." },
});

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
  // Minimal TwiML — escape XML special chars in the body.
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

function verifyTwilioSignature(req: Request): boolean {
  return evaluateTwilioWebhookAuth(req).ok;
}

/**
 * Reverse-lookup the user (tenant) for a Twilio "To" number.
 *
 * Twilio's inbound webhook fires on the number the customer texted.
 * We need to know which Wireline tenant owns that number so we can
 * write opt-outs to the right user's DNC list.
 *
 * Strategy: match the To number against wireline_phone_numbers.phone_number.
 * If not found (shared sender), match against settings.twilio_sms_from_number.
 */
async function lookupTenant(toNumber: string): Promise<string | null> {
  const normalized = sanitizePhone(toNumber);

  // Per-tenant phone number registration (preferred).
  const [byPhone] = await drizzle
    .select({ userId: schema.phoneNumbers.userId })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, normalized))
    .limit(1);
  if (byPhone?.userId) return byPhone.userId as string;

  // Per-tenant Twilio sender (also a tenant's number).
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

  // Twilio posts as form-urlencoded; Express needs body-parser registered
  // upstream. The server-context entry point already mounts urlencoded.
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

  if (!from || !to) {
    return res.status(400).send(twimlEmpty());
  }

  const tenantUserId = await lookupTenant(to);
  if (!tenantUserId) {
    // We received an SMS at a number we don't recognize. Log + drop.
    log.warn("Twilio webhook: unknown To-number", { to_suffix: phoneSuffixForLog(to) });
    return res.status(200).send(twimlEmpty());
  }

  const fromNormalized = sanitizePhone(from);

  return tenantStore.run(tenantUserId, async () => {
    // ─── OPT-OUT FLOW ──────────────────────────────────────────────
    if (matchesCarrierKeyword(trimmed, OPT_OUT_KEYWORDS)) {
      try {
        // Add to DNC (idempotent — onConflictDoNothing on user_id+phone)
        await drizzle
          .insert(schema.dncList)
          .values({
            userId: tenantUserId,
            // Canonical digits-only key so the outbound-call gate (isDncBlocked)
            // matches this opt-out. phoneRaw keeps the original for audit.
            phone: normalizeDncPhone(from),
            phoneRaw: from,
            reason: "opt-out",
            source: "sms_opt_out",
          })
          .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });

        // Audit trail in consent log
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
        // The suppression row never landed — do NOT confirm an opt-out that
        // does not exist. Tell the consumer to retry and page ops: an
        // unhonored STOP is a compliance incident, not telemetry.
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

    // ─── OPT-IN FLOW (resubscribe) ─────────────────────────────────
    if (matchesCarrierKeyword(trimmed, OPT_IN_KEYWORDS)) {
      try {
        // A customer SMS opt-in can reverse only an SMS-created suppression.
        // Manual, federal, voice, legal, complaint, and workspace DNC entries
        // remain intact until an authorized account holder removes them —
        // "yes please" to an appointment text must never clear a legal record.
        await drizzle.delete(schema.dncList).where(
          and(
            eq(schema.dncList.userId, tenantUserId),
            // Remove every stored variant so resubscribe clears legacy
            // "+"-prefixed and 10/11-digit rows too.
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
        // The DNC rows are still in place; a "resubscribed" confirmation
        // would be false (outbound stays blocked). Be honest instead.
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

    // ─── HELP FLOW ─────────────────────────────────────────────────
    if (matchesCarrierKeyword(trimmed, HELP_KEYWORDS)) {
      return res
        .status(200)
        .send(
          twimlReply(
            "Wireline SMS help: reply STOP to opt out or START to opt back in. Contact support@trywireline.com for support. Message and data rates may apply.",
          ),
        );
    }

    // ─── CSAT REPLY DETECTION ─────────────────────────────────────
    // If the inbound body is a bare digit 1–5, treat it as a CSAT
    // response to the most recent post-call satisfaction SMS we sent.
    // processCsatReply finds the caller's latest call log and writes
    // the score. Best-effort — never blocks or throws. We still fall
    // through to thread storage below so the Account Holder can see the
    // reply in /inbox.
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
      // Don't auto-reply — the CSAT SMS already told them what to do.
      // Fall through to persist the message in the SMS thread below.
    }

    // ─── TWO-WAY THREAD STORAGE ────────────────────────────────────
    // Persist the inbound message into the SMS inbox so account holders can
    // see + reply from /inbox. Idempotent thread upsert keyed by
    // (user_id, customer_number). If the sms tables haven't been
    // migrated yet, the catch just logs and we still return 200 to
    // Twilio so the network doesn't retry.
    try {
      if (messageSid) {
        const [duplicate] = await drizzle
          .select({ id: schema.smsMessages.id })
          .from(schema.smsMessages)
          .where(
            and(
              eq(schema.smsMessages.userId, tenantUserId),
              eq(schema.smsMessages.twilioSid, messageSid),
            ),
          )
          .limit(1);
        if (duplicate) {
          return res.status(200).send(twimlEmpty());
        }
      }

      const [existingThread] = await drizzle
        .select({ id: schema.smsThreads.id, unreadCount: schema.smsThreads.unreadCount })
        .from(schema.smsThreads)
        .where(
          and(
            eq(schema.smsThreads.userId, tenantUserId),
            eq(schema.smsThreads.customerNumber, fromNormalized),
          ),
        )
        .limit(1);

      let threadId: string;
      if (existingThread) {
        threadId = existingThread.id as unknown as string;
        await drizzle
          .update(schema.smsThreads)
          .set({
            lastMessageAt: new Date(),
            unreadCount: (existingThread.unreadCount ?? 0) + 1,
            status: "open",
          })
          .where(eq(schema.smsThreads.id, existingThread.id));
      } else {
        const [created] = await drizzle
          .insert(schema.smsThreads)
          .values({
            userId: tenantUserId,
            customerNumber: fromNormalized,
            unreadCount: 1,
          })
          .returning({ id: schema.smsThreads.id });
        threadId = (created?.id as unknown as string) || "";
      }

      if (threadId) {
        await drizzle.insert(schema.smsMessages).values({
          userId: tenantUserId,
          threadId,
          direction: "in",
          body,
          twilioSid: messageSid || null,
        });
      }
    } catch (e: any) {
      log.warn("SMS thread persist skipped (migration may be pending)", { error: e?.message });
    }

    // No auto-reply for non-keyword messages — Account Holder answers via /inbox.
    return res.status(200).send(twimlEmpty());
  });
});

/**
 * VOICE FALLBACK WEBHOOK (Vapi Resilience)
 * Twilio hits this if Vapi's SIP trunk or webhook fails (e.g. Vapi goes down).
 * We play an emergency degraded-mode message and offer voicemail or forward
 * to the business's human fallback number.
 */
router.post(
  "/api/twilio-webhook/voice-fallback",
  twilioVoiceRateLimiter,
  async (req: Request, res: Response) => {
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

    res.setHeader("Content-Type", "text/xml");

    const tenantUserId = await lookupTenant(to);

    // If we can't find the tenant or they don't have a human fallback number,
    // we just take a voicemail.
    let fallbackNumber = null;
    if (tenantUserId) {
      const [settings] = await drizzle
        .select({ humanFallbackNumber: schema.settings.twilioManagerAlertNumber })
        .from(schema.settings)
        .where(eq(schema.settings.userId, tenantUserId))
        .limit(1);
      fallbackNumber = settings?.humanFallbackNumber;
    }

    // Generate TwiML for a professional offline experience
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n`;
    twiml += `  <Say voice="Polly.Matthew-Neural">Hello, you have reached a Wireline agent line. We are currently experiencing an unexpectedly high volume of calls and our voice systems are temporarily offline.</Say>\n`;

    // Absolute URL to the brand transfer chime — Twilio's <Play> needs a
    // full URL because it fetches the media file itself. Falls back to the
    // canonical prod host when APP_URL isn't set (e.g. on a fresh deploy
    // before env was populated). The committed asset is regenerated by
    // scripts/generate-transfer-chime.mjs; if it were ever missing on a
    // deploy, Twilio skips <Play> gracefully and continues to the next
    // verb — no caller disruption.
    const appBaseUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
    const transferChimeUrl = `${appBaseUrl}/sounds/wireline-transfer-chime.wav`;

    if (fallbackNumber) {
      twiml += `  <Say voice="Polly.Matthew-Neural">Please hold while we transfer you to an available team member.</Say>\n`;
      // Brand transfer chime — only plays on the failover path (Vapi
      // down). Vapi's own transfer flow can't inject MP3s; see
      // vapi-assistant-factory-v2.ts for the spoken-message workaround used
      // during normal-runtime transfers.
      twiml += `  <Play>${transferChimeUrl}</Play>\n`;
      twiml += `  <Dial>${fallbackNumber}</Dial>\n`;
    } else {
      twiml += `  <Say voice="Polly.Matthew-Neural">Please leave your name, number, and a brief message, and a human agent will return your call as soon as possible. Thank you.</Say>\n`;
      twiml += `  <Record \n    maxLength="120" \n    action="/api/twilio-webhook/voicemail-complete" \n    transcribe="true"\n  />\n`;
    }

    twiml += `</Response>`;

    return res.status(200).send(twiml);
  },
);

router.post(
  "/api/twilio-webhook/voicemail-complete",
  twilioVoiceRateLimiter,
  async (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      log.warn("Twilio webhook signature verification failed", { path: req.path });
      return res
        .status(403)
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }

    const recordingUrl =
      typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl.trim() : "";
    const transcription =
      typeof req.body?.TranscriptionText === "string" ? req.body.TranscriptionText.trim() : "";
    const from = typeof req.body?.From === "string" ? req.body.From : "";
    const to = typeof req.body?.To === "string" ? req.body.To : "";
    const durationRaw = Number(req.body?.RecordingDuration);
    const durationSeconds = Number.isFinite(durationRaw)
      ? Math.max(0, Math.round(durationRaw))
      : null;

    // Persist + notify off the critical Twilio response path — hang up first
    // so the caller isn't waiting on DB/email, then run tenant work.
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);

    if (!recordingUrl) {
      log.warn("Voicemail complete missing RecordingUrl", {
        from_suffix: phoneSuffixForLog(from),
        to_suffix: phoneSuffixForLog(to),
      });
      return;
    }

    try {
      const tenantUserId = to ? await lookupTenant(to) : null;
      if (!tenantUserId) {
        log.warn("Voicemail recorded but no tenant matched To number", {
          to_suffix: phoneSuffixForLog(to),
          from_suffix: phoneSuffixForLog(from),
        });
        return;
      }

      await tenantStore.run(tenantUserId, async () => {
        await drizzle.insert(schema.callLogs).values({
          userId: tenantUserId,
          direction: "inbound",
          customerNumber: from ? sanitizePhone(from) || from : null,
          durationSeconds,
          recordingUrl,
          transcript: transcription || null,
          summary: "Voicemail left during voice failover (Vapi unavailable).",
          outcomeTag: "voicemail",
          intentLabel: "voicemail",
        });

        // Best-effort owner notify via Resend — still inside tenant context.
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
              recordingUrl,
              transcription,
            });
            await sendEmail({
              to: owner.email,
              subject: "Wireline: voicemail left during call failover",
              ...voicemailEmail,
            });
          }
        } catch (notifyErr) {
          log.warn("Voicemail owner notify failed", {
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      });

      log.info("Voicemail persisted during Vapi failover", {
        tenant_suffix: opaqueIdSuffixForLog(tenantUserId),
        from_suffix: phoneSuffixForLog(from),
        to_suffix: phoneSuffixForLog(to),
        has_recording: true,
        has_transcript: Boolean(transcription),
      });
    } catch (err) {
      log.error("Failed to persist failover voicemail", {
        error: err instanceof Error ? err.message : String(err),
        from_suffix: phoneSuffixForLog(from),
        to_suffix: phoneSuffixForLog(to),
        has_recording: Boolean(recordingUrl),
      });
    }
  },
);

/**
 * SINGING RECEPTIONIST PRE-ROLL (Fun Demo)
 *
 * Twilio Voice webhook that plays the pre-baked jingle
 * (Mira's intro), then bridges the call to the Vapi-routed
 * receptionist assistant. Wire this URL as the Voice webhook on the
 * Twilio number that backs the showcase demo:
 *   POST https://trywireline.com/api/twilio-webhook/singing-receptionist
 *
 * Why this layer exists:
 *   Vapi's `firstMessage` is text-only — it can't play an MP3 before
 *   the LLM starts speaking. To get a pre-roll jingle on a real
 *   inbound call, we have to intercept at the carrier layer (Twilio)
 *   with TwiML <Play>, then bridge the audio to Vapi via SIP.
 *
 * Configuration:
 *   1. The committed jingle at /public/sounds/wireline-jingle.mp3 is
 *      served at /sounds/wireline-jingle.mp3 by Vite's static handler.
 *      Regenerate locally with scripts/generate-jingle.mjs (ElevenLabs);
 *      do not rely on an ephemeral production filesystem for this
 *      static asset.
 *   2. SINGING_VAPI_SIP_URI env var holds the Vapi SIP endpoint for
 *      the showcase assistant (Vapi Dashboard → Phone Numbers → SIP
 *      URI). Format: sip:<assistant-id>@sip.vapi.ai
 *   3. In Twilio, set the Voice URL on the Singing Receptionist
 *      number to POST this endpoint.
 *
 * If SINGING_VAPI_SIP_URI is unset (dev or pre-wire), we fall back
 * to a graceful spoken message instead of leaving the caller in
 * silence — Twilio numbers are real money + real customers.
 */
router.post(
  "/api/twilio-webhook/singing-receptionist",
  twilioVoiceRateLimiter,
  (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      log.warn("Twilio webhook signature verification failed", { path: req.path });
      return res.status(403).send(twimlEmpty());
    }
    const from = (req.body?.From as string | undefined) || "";
    log.info("Singing receptionist demo line hit", {
      from_suffix: phoneSuffixForLog(from),
    });

    res.setHeader("Content-Type", "text/xml");

    // Absolute URL for Twilio <Play> — Twilio's media fetcher needs a
    // public origin. Falls back to the prod host when APP_URL isn't set.
    const appBaseUrl = (process.env.APP_URL || "https://trywireline.com").replace(/\/+$/, "");
    const jingleUrl = `${appBaseUrl}/sounds/wireline-jingle.mp3`;
    const sipUri = process.env.SINGING_VAPI_SIP_URI || "";

    let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n`;
    twiml += `  <Play>${jingleUrl}</Play>\n`;
    if (sipUri) {
      // Bridge to Vapi via SIP. answerOnBridge defers Twilio's billing
      // start until Vapi actually answers, so the caller isn't billed for
      // the jingle-only window if Vapi's down. Caller hears:
      //   jingle → Mira's "Haha sorry about that!" → conversation.
      twiml += `  <Dial answerOnBridge="true"><Sip>${sipUri}</Sip></Dial>\n`;
    } else {
      // Dev / unconfigured fallback. Lets a curl smoke-test the route
      // return clean TwiML even before Vapi is wired up.
      twiml += `  <Say voice="Polly.Joanna-Neural">Haha, sorry about that. We like to have fun at Wireline sometimes. To finish setting up this demo, configure the SINGING_VAPI_SIP_URI environment variable. Goodbye.</Say>\n`;
      twiml += `  <Hangup/>\n`;
    }
    twiml += `</Response>`;

    return res.status(200).send(twiml);
  },
);

export default router;
