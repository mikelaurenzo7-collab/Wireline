import { Router, type NextFunction, type Request, type Response } from "express";
import { and, eq, inArray, or } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { dncPhoneCandidates, normalizeDncPhone } from "../lib/compliance";
import { reportError } from "../lib/error-reporter";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { claimTwilioUsageAlert } from "../lib/twilio-usage-alert-idempotency";
import { sanitizePhone } from "../lib/vapi-helpers";
import baseRouter from "./twilio-webhook-base";

const router = Router();
const LEGACY_OPT_IN_KEYWORDS = new Set(["start", "unstop", "yes", "optin", "opt-in", "opt in"]);

function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

function optInConfirmationTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been resubscribed. Welcome back.</Message></Response>`;
}

async function tenantForSender(toValue: string): Promise<string | null> {
  const normalized = sanitizePhone(String(toValue || "").replace(/^whatsapp:/i, ""));
  if (!normalized) return null;

  const [line] = await drizzle
    .select({ userId: schema.phoneNumbers.userId })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, normalized))
    .limit(1);
  if (line?.userId) return line.userId;

  const [settings] = await drizzle
    .select({ userId: schema.settings.userId })
    .from(schema.settings)
    .where(
      or(
        eq(schema.settings.twilioSmsFromNumber, normalized),
        eq(schema.settings.twilioWhatsappFromNumber, normalized),
      ),
    )
    .limit(1);
  return settings?.userId || null;
}

/**
 * Twilio Advanced Opt-Out has already sent the confirmation response when
 * OptOutType is present. We also intercept legacy START-style replies here so
 * they can only reverse an SMS-created suppression. The older base route used
 * to delete every matching DNC row, including manual/legal records.
 */
router.post("/api/twilio-webhook/sms", async (req: Request, res: Response, next: NextFunction) => {
  const optOutType = String(req.body?.OptOutType || "").toUpperCase();
  const bodyKeyword = String(req.body?.Body || "")
    .trim()
    .toLowerCase();
  const legacyOptIn = !optOutType && LEGACY_OPT_IN_KEYWORDS.has(bodyKeyword);
  if (!optOutType && !legacyOptIn) return next();
  if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send(emptyTwiml());

  const userId = await tenantForSender(String(req.body?.To || ""));
  const customerNumber = sanitizePhone(String(req.body?.From || "").replace(/^whatsapp:/i, ""));
  if (!userId || !customerNumber) return res.status(200).send(emptyTwiml());

  return tenantStore.run(userId, async () => {
    try {
      if (optOutType === "STOP") {
        await drizzle
          .insert(schema.dncList)
          .values({
            userId,
            // Canonical digits-only key so the outbound-call gate matches.
            phone: normalizeDncPhone(customerNumber),
            phoneRaw: String(req.body?.From || ""),
            reason: "opt-out",
            source: "twilio_advanced_opt_out",
          })
          .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });
      } else if (optOutType === "START" || legacyOptIn) {
        // A customer SMS opt-in can reverse only an SMS-created suppression.
        // Manual, federal, voice, legal, complaint, and workspace DNC entries
        // remain intact until an authorized account holder removes them.
        await drizzle
          .delete(schema.dncList)
          .where(
            and(
              eq(schema.dncList.userId, userId),
              inArray(schema.dncList.phone, dncPhoneCandidates(customerNumber)),
              eq(schema.dncList.reason, "opt-out"),
              or(
                eq(schema.dncList.source, "twilio_advanced_opt_out"),
                eq(schema.dncList.source, "sms_opt_out"),
              ),
            ),
          );
      }

      await drizzle.insert(schema.consentLog).values({
        userId,
        customerNumber,
        event:
          optOutType === "STOP"
            ? "sms_opt_out"
            : optOutType === "START" || legacyOptIn
              ? "sms_opt_in"
              : "sms_help",
        rule: legacyOptIn ? "legacy_start_keyword" : "twilio_advanced_opt_out",
        ruleVersion: "v1",
        state:
          optOutType === "STOP"
            ? "opted_out"
            : optOutType === "START" || legacyOptIn
              ? "opted_in"
              : "unchanged",
      });
    } catch (error) {
      log.error("Twilio opt-out persistence failed", {
        userId,
        optOutType: optOutType || "LEGACY_START",
        error: getErrorMessage(error),
      });
      // STOP: Twilio Advanced Opt-Out already suppressed the number at the
      // carrier level, but the DNC row that gates outbound VOICE never landed
      // — page ops instead of dropping the failure on the floor.
      if (optOutType === "STOP") {
        reportError(error instanceof Error ? error : new Error(getErrorMessage(error)), {
          route: "/api/twilio-webhook/sms",
          flow: "twilio_advanced_opt_out",
          tenant: userId,
        });
      }
      res.setHeader("Content-Type", "text/xml");
      // Never confirm a resubscribe whose delete failed — the DNC rows are
      // still blocking outbound and "Welcome back" would be false.
      return res
        .status(200)
        .send(
          legacyOptIn
            ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>We couldn't process your resubscribe request just now. Please reply START again in a few minutes.</Message></Response>`
            : emptyTwiml(),
        );
    }
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(legacyOptIn ? optInConfirmationTwiml() : emptyTwiml());
  });
});

/** Delivery/read/failure telemetry for SMS and future private-beta channels. */
router.post("/api/twilio-webhook/message-status", async (req: Request, res: Response) => {
  if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send("Forbidden");

  const messageSid = String(req.body?.MessageSid || req.body?.SmsSid || "");
  const status = String(req.body?.MessageStatus || req.body?.SmsStatus || "unknown").toLowerCase();
  const errorCode = String(req.body?.ErrorCode || "").trim() || null;
  if (!messageSid) return res.status(204).end();

  try {
    const [message] = await drizzle
      .select({
        userId: schema.smsMessages.userId,
        threadId: schema.smsMessages.threadId,
      })
      .from(schema.smsMessages)
      .where(eq(schema.smsMessages.twilioSid, messageSid))
      .limit(1);

    if (message?.userId) {
      await tenantStore.run(message.userId, async () => {
        await drizzle.insert(schema.webhookHealth).values({
          userId: message.userId,
          provider: "twilio_messaging",
          eventType: status,
          outcome: errorCode ? `error_${errorCode}` : status,
        });

        if (message.threadId && ["failed", "undelivered"].includes(status)) {
          await drizzle
            .update(schema.smsThreads)
            .set({
              status: "delivery_failed",
              summary: `Latest outbound message ${status}${errorCode ? ` (Twilio ${errorCode})` : ""}.`,
            })
            .where(eq(schema.smsThreads.id, message.threadId));
        } else if (message.threadId && ["delivered", "read"].includes(status)) {
          await drizzle
            .update(schema.smsThreads)
            .set({ status: "open" })
            .where(eq(schema.smsThreads.id, message.threadId));
        }
      });
    }
  } catch (error) {
    // Twilio retries non-2xx callbacks. Persisting telemetry is best-effort and
    // must not create a callback storm when the database is transiently down.
    log.warn("Twilio message status persistence failed", {
      messageSid,
      status,
      errorCode,
      error: getErrorMessage(error),
    });
  }

  return res.status(204).end();
});

/**
 * Account-level Twilio Usage Trigger callback. Twilio may deliver the same
 * threshold callback more than once, so alerting is guarded by the documented
 * IdempotencyToken in shared Redis. This endpoint is intentionally separate
 * from tenant message/call telemetry: it protects Wireline's platform account.
 */
router.post("/api/twilio-webhook/usage-alert", async (req: Request, res: Response) => {
  if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send("Forbidden");

  const idempotencyToken = String(req.body?.IdempotencyToken || "").trim();
  const triggerSid = String(req.body?.UsageTriggerSid || "").trim();
  const recurring = String(req.body?.Recurring || "unknown")
    .trim()
    .toLowerCase();
  const triggerValue = String(req.body?.TriggerValue || "unknown").trim();
  const currentValue = String(req.body?.CurrentValue || "unknown").trim();

  if (!idempotencyToken || !triggerSid) {
    return res.status(400).send("Missing Usage Trigger identity");
  }

  const claim = await claimTwilioUsageAlert(idempotencyToken);
  if (claim === "duplicate") return res.status(204).end();
  if (claim === "unavailable") {
    log.error("Twilio usage alert idempotency unavailable", { triggerSid, recurring });
    return res.status(503).send("Alert persistence unavailable");
  }

  const context = { triggerSid, recurring, triggerValue, currentValue };
  log.error("Twilio account usage threshold reached", context);
  reportError(new Error("Twilio account usage threshold reached"), {
    route: "/api/twilio-webhook/usage-alert",
    provider: "twilio",
    ...context,
  });

  try {
    await drizzle.insert(schema.webhookHealth).values({
      userId: null,
      provider: "twilio_usage",
      eventType: recurring,
      outcome: `threshold_${triggerValue}`.slice(0, 128),
    });
  } catch (error) {
    // The alert is already claimed and present in Vercel/Sentry. Do not ask
    // Twilio to retry indefinitely just because secondary telemetry is down.
    log.warn("Twilio usage alert database telemetry failed", {
      triggerSid,
      error: getErrorMessage(error),
    });
  }

  const alertEmail = String(process.env.OPS_ALERT_EMAIL || process.env.OWNER_EMAIL || "").trim();
  if (alertEmail) {
    try {
      const { sendEmail } = await import("../lib/email-service");
      const text = [
        "Wireline's Twilio account reached a configured usage threshold.",
        `Window: ${recurring}`,
        `Threshold: ${triggerValue}`,
        `Current value: ${currentValue}`,
        `Trigger: ${triggerSid}`,
        "Review Twilio usage before raising or removing the limit.",
      ].join("\n");
      const safeHtml = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      const sent = await sendEmail({
        to: alertEmail,
        subject: `[Wireline] Twilio ${recurring} usage threshold reached`,
        text,
        html: `<p>${safeHtml}</p>`,
      });
      if (!sent.ok) log.error("Twilio usage alert email failed", { triggerSid, error: sent.error });
    } catch (error) {
      log.error("Twilio usage alert email threw", { triggerSid, error: getErrorMessage(error) });
    }
  }

  return res.status(204).end();
});

router.use(baseRouter);

export default router;
