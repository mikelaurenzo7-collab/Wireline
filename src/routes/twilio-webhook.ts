import { Router, type NextFunction, type Request, type Response } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { matchesCarrierKeyword } from "../lib/carrier-keywords";
import { dncPhoneCandidates, normalizeDncPhone } from "../lib/compliance";
import { clearDncFailsafe, recordDncFailsafe } from "../lib/dnc-failsafe";
import { reportError } from "../lib/error-reporter";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { claimTwilioUsageAlert } from "../lib/twilio-usage-alert-idempotency";
import {
  opaqueIdSuffixForLog,
  phoneSuffixForLog,
} from "../lib/twilio-webhook-privacy";
import { sanitizePhone } from "../lib/vapi-helpers";
import baseRouter from "./twilio-webhook-base";

const router = Router();
const LEGACY_OPT_OUT_KEYWORDS = new Set([
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
const LEGACY_OPT_IN_KEYWORDS = new Set(["start", "unstop", "yes", "optin", "opt-in", "opt in"]);

type ConsentControl = "stop" | "start" | "help";

function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

function optOutConfirmationTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed. You will not receive any more messages from this number. Reply START to opt back in.</Message></Response>`;
}

function optInConfirmationTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been resubscribed. Welcome back.</Message></Response>`;
}

function optOutRetryTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>We couldn't process your unsubscribe request just now. Please reply STOP again in a few minutes.</Message></Response>`;
}

function optInRetryTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>We couldn't process your resubscribe request just now. Please reply START again in a few minutes.</Message></Response>`;
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

function resolveConsentControl(optOutType: string, bodyKeyword: string): {
  control: ConsentControl | null;
  legacy: boolean;
} {
  if (optOutType === "STOP") return { control: "stop", legacy: false };
  if (optOutType === "START") return { control: "start", legacy: false };
  if (optOutType === "HELP") return { control: "help", legacy: false };
  if (optOutType) return { control: null, legacy: false };
  if (matchesCarrierKeyword(bodyKeyword, LEGACY_OPT_OUT_KEYWORDS)) {
    return { control: "stop", legacy: true };
  }
  if (matchesCarrierKeyword(bodyKeyword, LEGACY_OPT_IN_KEYWORDS)) {
    return { control: "start", legacy: true };
  }
  return { control: null, legacy: false };
}

async function persistConsentControl(input: {
  userId: string;
  customerNumber: string;
  phoneRaw: string;
  messageSid: string;
  optOutType: string;
  bodyKeyword: string;
  control: ConsentControl;
  legacy: boolean;
}): Promise<"applied" | "duplicate"> {
  const event =
    input.control === "stop"
      ? "sms_opt_out"
      : input.control === "start"
        ? "sms_opt_in"
        : "sms_help";
  const normalizedCustomerNumber = normalizeDncPhone(input.customerNumber);
  const stateIdentity = `${input.userId}:${normalizedCustomerNumber}`;

  return drizzle.transaction(async (tx: typeof drizzle) => {
    // Serialize every consent mutation for the same tenant and consumer. Locking
    // by MessageSid only deduplicates one delivery; it does not prevent distinct
    // START and STOP webhooks from committing out of order for the same number.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`twilio-consent-state:${stateIdentity}`}))`,
    );

    if (input.messageSid) {
      const [existing] = await tx
        .select({ id: schema.consentLog.id })
        .from(schema.consentLog)
        .where(
          and(
            eq(schema.consentLog.userId, input.userId),
            sql`${schema.consentLog.metadata} ->> 'twilio_message_sid' = ${input.messageSid}`,
          ),
        )
        .limit(1);
      if (existing) return "duplicate";
    }

    if (input.control === "stop") {
      await tx
        .insert(schema.dncList)
        .values({
          userId: input.userId,
          phone: normalizedCustomerNumber,
          phoneRaw: input.phoneRaw,
          reason: "opt-out",
          source: input.legacy ? "sms_opt_out" : "twilio_advanced_opt_out",
        })
        .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });
    } else if (input.control === "start") {
      // A customer SMS opt-in can reverse only an SMS-created suppression.
      // Manual, federal, voice, legal, complaint, and workspace DNC entries
      // remain intact until an authorized account holder removes them.
      await tx
        .delete(schema.dncList)
        .where(
          and(
            eq(schema.dncList.userId, input.userId),
            inArray(schema.dncList.phone, dncPhoneCandidates(input.customerNumber)),
            eq(schema.dncList.reason, "opt-out"),
            or(
              eq(schema.dncList.source, "twilio_advanced_opt_out"),
              eq(schema.dncList.source, "sms_opt_out"),
            ),
          ),
        );
    }

    await tx.insert(schema.consentLog).values({
      userId: input.userId,
      customerNumber: input.customerNumber,
      event,
      rule: input.legacy
        ? input.control === "stop"
          ? "legacy_stop_keyword"
          : "legacy_start_keyword"
        : "twilio_advanced_opt_out",
      ruleVersion: "v1",
      state:
        input.control === "stop"
          ? "opted_out"
          : input.control === "start"
            ? "opted_in"
            : "unchanged",
      metadata: {
        twilio_message_sid: input.messageSid || null,
        opt_out_type: input.optOutType || null,
        keyword: input.bodyKeyword || null,
      },
    });

    return "applied";
  });
}

/**
 * Twilio Advanced Opt-Out has already sent its own carrier confirmation when
 * OptOutType is present. Legacy STOP/START replies are intercepted here too so
 * every DNC mutation and consent event commits atomically through one path.
 */
router.post("/api/twilio-webhook/sms", async (req: Request, res: Response, next: NextFunction) => {
  const optOutType = String(req.body?.OptOutType || "").toUpperCase();
  const bodyKeyword = String(req.body?.Body || "")
    .trim()
    .toLowerCase();
  const { control, legacy } = resolveConsentControl(optOutType, bodyKeyword);
  if (!control) return next();
  if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send(emptyTwiml());

  const userId = await tenantForSender(String(req.body?.To || ""));
  const phoneRaw = String(req.body?.From || "");
  const customerNumber = sanitizePhone(phoneRaw.replace(/^whatsapp:/i, ""));
  const messageSid = String(req.body?.MessageSid || req.body?.SmsSid || "").trim();
  if (!userId || !customerNumber) return res.status(200).send(emptyTwiml());

  return tenantStore.run(userId, async () => {
    try {
      await persistConsentControl({
        userId,
        customerNumber,
        phoneRaw,
        messageSid,
        optOutType,
        bodyKeyword,
        control,
        legacy,
      });

      if (control === "start") {
        // Commit the canonical delete + consent event first. A stale emergency
        // marker remains authoritative until it can be cleared successfully.
        const failsafeCleared = await clearDncFailsafe(userId, customerNumber);
        if (!failsafeCleared) throw new Error("DNC_FAILSAFE_CLEAR_FAILED");
      }
    } catch (error) {
      let failsafeStored = false;
      if (control === "stop") {
        // Preserve the consumer's STOP for outbound voice if the Postgres
        // transaction fails. Advanced Opt-Out independently suppresses carrier
        // messaging; legacy STOP is never confirmed until Postgres commits.
        failsafeStored = await recordDncFailsafe(userId, customerNumber);
      }

      log.error("Twilio consent-control persistence failed", {
        tenant_suffix: opaqueIdSuffixForLog(userId),
        customer_suffix: phoneSuffixForLog(customerNumber),
        control,
        advanced: !legacy,
        failsafeStored,
        error: getErrorMessage(error),
      });
      if (control === "stop") {
        reportError(error instanceof Error ? error : new Error(getErrorMessage(error)), {
          route: "/api/twilio-webhook/sms",
          flow: legacy ? "legacy_sms_opt_out" : "twilio_advanced_opt_out",
          tenant: opaqueIdSuffixForLog(userId),
          failsafeStored,
        });
      }

      res.setHeader("Content-Type", "text/xml");
      if (control === "stop") {
        if (legacy) return res.status(200).send(optOutRetryTwiml());
        return res.status(failsafeStored ? 200 : 503).send(emptyTwiml());
      }
      if (control === "start") {
        return res.status(200).send(legacy ? optInRetryTwiml() : emptyTwiml());
      }
      return res.status(200).send(emptyTwiml());
    }

    res.setHeader("Content-Type", "text/xml");
    if (!legacy) return res.status(200).send(emptyTwiml());
    return res
      .status(200)
      .send(control === "stop" ? optOutConfirmationTwiml() : optInConfirmationTwiml());
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
