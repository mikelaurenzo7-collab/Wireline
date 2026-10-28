import { Router, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { matchesCarrierKeyword } from "../lib/carrier-keywords";
import { dncPhoneCandidates, normalizeDncPhone } from "../lib/compliance";
import { clearDncFailsafe, recordDncFailsafe } from "../lib/dnc-failsafe";
import { reportError } from "../lib/error-reporter";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { shouldApplyTwilioMessageStatusTransition } from "../lib/twilio-message-reliability";
import { resolveTwilioInboundEnvironment } from "../lib/twilio-inbound-environment";
import { claimTwilioUsageAlert } from "../lib/twilio-usage-alert-idempotency";
import { opaqueIdSuffixForLog, phoneSuffixForLog } from "../lib/twilio-webhook-privacy";
import { sanitizePhone } from "../lib/agent-runtime-helpers";
import baseRouter from "./twilio-webhook-base";
import { lookupMessagingDestination, persistInboundSmsEvidence } from "./twilio-webhook-base";
import tollfreeWebhookRouter from "./twilio-tollfree-webhook";

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
const LEGACY_HELP_KEYWORDS = new Set(["help", "info", "support"]);

type ConsentControl = "stop" | "start" | "help";

function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
}

async function recordTwilioMessageStatusReceipt(
  tx: typeof drizzle,
  input: {
    userId: string | null;
    messageSid: string;
    status: string;
    errorCode: string | null;
    operational: boolean;
  },
): Promise<boolean> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`twilio-message-status:${input.messageSid}`}))`,
  );

  const [lastApplied] = await tx
    .select({
      status: sql<string>`${schema.auditLog.metadata} ->> 'status'`,
    })
    .from(schema.auditLog)
    .where(
      and(
        input.userId === null
          ? isNull(schema.auditLog.userId)
          : eq(schema.auditLog.userId, input.userId),
        eq(schema.auditLog.provider, "twilio"),
        eq(schema.auditLog.action, "twilio.message_status_applied"),
        eq(schema.auditLog.resourceType, "twilio_message"),
        eq(schema.auditLog.resourceId, input.messageSid),
      ),
    )
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(1);

  const applied = shouldApplyTwilioMessageStatusTransition(lastApplied?.status, input.status);
  const deliveryFailed = ["failed", "undelivered", "canceled"].includes(input.status);
  await tx.insert(schema.auditLog).values({
    userId: input.userId,
    action: applied ? "twilio.message_status_applied" : "twilio.message_status_ignored",
    provider: "twilio",
    eventType: "provider.webhook",
    severity: deliveryFailed || input.errorCode ? "error" : "info",
    resourceType: "twilio_message",
    resourceId: input.messageSid,
    metadata: {
      status: input.status,
      previous_status: lastApplied?.status || null,
      error_code: input.errorCode,
      operational: input.operational,
      applied,
    },
  });

  return applied;
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

function helpConfirmationTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>BotBound SMS help: reply STOP to opt out or START to opt back in. Contact support@botbound.app for support. Message and data rates may apply.</Message></Response>`;
}

function resolveConsentControl(
  optOutType: string,
  bodyKeyword: string,
): {
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
  // Exact only. A legacy opt-in is a consent GRANT written to the TCPA ledger.
  // Leading-word matching once turned "Yes please, Tuesday works" into a
  // fabricated consent record. Every intercepted control is persisted below as
  // inbox evidence before an optional application reply is returned.
  if (matchesCarrierKeyword(bodyKeyword, LEGACY_OPT_IN_KEYWORDS, "exact")) {
    return { control: "start", legacy: true };
  }
  if (matchesCarrierKeyword(bodyKeyword, LEGACY_HELP_KEYWORDS, "exact")) {
    return { control: "help", legacy: true };
  }
  return { control: null, legacy: false };
}

async function persistConsentControl(input: {
  userId: string;
  agentId: string | null;
  destinationNumber: string;
  customerNumber: string;
  phoneRaw: string;
  messageSid: string;
  optOutType: string;
  bodyKeyword: string;
  body: string;
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
      if (existing) {
        await persistInboundSmsEvidence(tx, {
          userId: input.userId,
          agentId: input.agentId,
          destinationNumber: input.destinationNumber,
          customerNumber: input.customerNumber,
          body: input.body,
          messageSid: input.messageSid,
        });
        return "duplicate";
      }
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
          : input.control === "start"
            ? "legacy_start_keyword"
            : "legacy_help_keyword"
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

    await persistInboundSmsEvidence(tx, {
      userId: input.userId,
      agentId: input.agentId,
      destinationNumber: input.destinationNumber,
      customerNumber: input.customerNumber,
      body: input.body,
      messageSid: input.messageSid,
    });

    return "applied";
  });
}

/**
 * Twilio Advanced Opt-Out has already sent its own carrier confirmation when
 * OptOutType is present. Legacy STOP/START/HELP replies are intercepted here too so
 * every DNC mutation and consent event commits atomically through one path.
 */
router.post("/api/twilio-webhook/sms", async (req: Request, res: Response, next: NextFunction) => {
  const optOutType = String(req.body?.OptOutType || "").toUpperCase();
  const bodyKeyword = String(req.body?.Body || "")
    .trim()
    .toLowerCase();
  const body = String(req.body?.Body || "");
  const { control, legacy } = resolveConsentControl(optOutType, bodyKeyword);
  if (!control) return next();
  if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send(emptyTwiml());

  const destination = await lookupMessagingDestination(String(req.body?.To || ""));
  const userId = destination?.userId ?? null;
  const phoneRaw = String(req.body?.From || "");
  const customerNumber = sanitizePhone(phoneRaw.replace(/^whatsapp:/i, ""));
  const messageSid = String(req.body?.MessageSid || req.body?.SmsSid || "").trim();
  if (!userId || !destination || !customerNumber) return res.status(200).send(emptyTwiml());

  const replyEnvironment = await resolveTwilioInboundEnvironment(userId);
  if (!replyEnvironment.allowed) {
    log.warn("Signed Twilio consent reply suppressed by account environment", {
      tenant_suffix: opaqueIdSuffixForLog(userId),
      account_environment: replyEnvironment.environment ?? "missing",
      code: replyEnvironment.code,
    });
  }
  const productionReply = (twiml: string): string =>
    replyEnvironment.allowed ? twiml : emptyTwiml();

  return tenantStore.run(userId, async () => {
    try {
      const result = await persistConsentControl({
        userId,
        agentId: destination.agentId,
        destinationNumber: destination.destinationNumber,
        customerNumber,
        phoneRaw,
        messageSid,
        optOutType,
        bodyKeyword,
        body,
        control,
        legacy,
      });

      if (result === "duplicate") {
        // Provider redelivery must not generate another paid confirmation or
        // let an old START erase a newer emergency STOP. If the first START's
        // failsafe clear failed, the retry prompt asks for a fresh START/SID.
        res.setHeader("Content-Type", "text/xml");
        return res.status(200).send(emptyTwiml());
      }

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
        if (legacy) return res.status(200).send(productionReply(optOutRetryTwiml()));
        return res.status(failsafeStored ? 200 : 503).send(emptyTwiml());
      }
      if (control === "start") {
        return res.status(200).send(legacy ? productionReply(optInRetryTwiml()) : emptyTwiml());
      }
      return res.status(503).send(emptyTwiml());
    }

    res.setHeader("Content-Type", "text/xml");
    if (!legacy) return res.status(200).send(emptyTwiml());
    const confirmation =
      control === "stop"
        ? optOutConfirmationTwiml()
        : control === "start"
          ? optInConfirmationTwiml()
          : helpConfirmationTwiml();
    return res.status(200).send(productionReply(confirmation));
  });
});

/** Delivery/read/failure telemetry for SMS and future private-beta channels. */
router.post("/api/twilio-webhook/message-status", async (req: Request, res: Response) => {
  if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send("Forbidden");

  const messageSid = String(req.body?.MessageSid || req.body?.SmsSid || "").trim();
  const status = String(req.body?.MessageStatus || req.body?.SmsStatus || "unknown").toLowerCase();
  const errorCode = String(req.body?.ErrorCode || "").trim() || null;
  if (!messageSid) return res.status(204).end();
  const deliveryFailed = ["failed", "undelivered", "canceled"].includes(status);
  // Scope is part of Twilio's signed callback URL, so a caller cannot promote
  // an arbitrary failed customer message into a platform operational alert.
  const callbackScope = String(req.query.scope || "");
  const legacyOperationalCallback = callbackScope === "operational";
  const systemOperationalCallback = callbackScope === "operational-system";
  const operationalCallback = legacyOperationalCallback || systemOperationalCallback;

  try {
    const [message] = await drizzle
      .select({
        id: schema.smsMessages.id,
        userId: schema.smsMessages.userId,
        threadId: schema.smsMessages.threadId,
      })
      .from(schema.smsMessages)
      .where(eq(schema.smsMessages.twilioSid, messageSid))
      .limit(1);

    if (message?.userId) {
      const operationalAlert = operationalCallback || !message.threadId;
      const statusApplied = await tenantStore.run(message.userId, () =>
        drizzle.transaction(async (tx: typeof drizzle) => {
          const applied = await recordTwilioMessageStatusReceipt(tx, {
            userId: message.userId,
            messageSid,
            status,
            errorCode,
            operational: operationalAlert,
          });
          if (!applied) return false;

          await tx.insert(schema.webhookHealth).values({
            userId: message.userId,
            provider: operationalAlert ? "twilio_operational" : "twilio_messaging",
            eventType: status,
            outcome: errorCode ? `error_${errorCode}` : status,
          });

          // Delivery telemetry shares one status column with the account
          // holder's Outcome Center state. Telemetry must never move a thread
          // off an operator-owned outcome: `escalated` is pinned to an active
          // human-handoff task (sms-outcome-routes completes/reopens that task
          // by status), and `booked`/`resolved` are terminal outcomes. A read
          // receipt arriving hours after the operator resolved the thread used
          // to silently flip it back to `open` while the handoff task stayed
          // completed — Inbox and Approvals disagreed about ownership.
          //
          // Callbacks also arrive out of order across messages: a delayed
          // receipt for an OLDER message must not overwrite what the thread's
          // newest outbound already established. The durable receipt gate above
          // also pins same-SID terminal truth before this thread projection.
          const relevantStatus = [
            "failed",
            "undelivered",
            "canceled",
            "delivered",
            "read",
          ].includes(status);
          if (message.threadId && relevantStatus) {
            const [latestOutbound] = await tx
              .select({ id: schema.smsMessages.id })
              .from(schema.smsMessages)
              .where(
                and(
                  eq(schema.smsMessages.threadId, message.threadId),
                  eq(schema.smsMessages.direction, "out"),
                ),
              )
              .orderBy(desc(schema.smsMessages.createdAt), desc(schema.smsMessages.id))
              .limit(1);
            const speaksForThread = latestOutbound?.id === message.id;

            if (speaksForThread && ["failed", "undelivered", "canceled"].includes(status)) {
              const failureSummary = `Latest outbound message ${status}${errorCode ? ` (Twilio ${errorCode})` : ""}.`;
              await tx
                .update(schema.smsThreads)
                .set({
                  status: "delivery_failed",
                  summary: failureSummary,
                })
                .where(
                  and(
                    eq(schema.smsThreads.id, message.threadId),
                    or(
                      isNull(schema.smsThreads.status),
                      inArray(schema.smsThreads.status, ["open", "waiting", "delivery_failed"]),
                    ),
                  ),
                );
              // `escalated` is operator-ACTIVE, not final: a human is working
              // this thread and their outbound just bounced. The status stays
              // pinned (the handoff task is keyed to it), but the failure must
              // still be visible where the operator is looking.
              await tx
                .update(schema.smsThreads)
                .set({ summary: failureSummary })
                .where(
                  and(
                    eq(schema.smsThreads.id, message.threadId),
                    eq(schema.smsThreads.status, "escalated"),
                  ),
                );
            } else if (speaksForThread && ["delivered", "read"].includes(status)) {
              // `open` here only clears a stale delivery-failure flag once the
              // latest message lands; it must not reopen live or operator-final
              // threads.
              await tx
                .update(schema.smsThreads)
                .set({ status: "open" })
                .where(
                  and(
                    eq(schema.smsThreads.id, message.threadId),
                    eq(schema.smsThreads.status, "delivery_failed"),
                  ),
                );
            }
          }

          return true;
        }),
      );

      if (operationalAlert && deliveryFailed && statusApplied) {
        const context = {
          status,
          errorCode,
          messageSid: opaqueIdSuffixForLog(messageSid),
          tenant: opaqueIdSuffixForLog(message.userId),
        };
        log.error("Twilio operational SMS delivery failed after provider acceptance", context);
        reportError(new Error("Twilio operational SMS delivery failed"), {
          route: "/api/twilio-webhook/message-status",
          provider: "twilio_operational",
          ...context,
        });
      }
    } else if (systemOperationalCallback || (legacyOperationalCallback && deliveryFailed)) {
      // Intentionally unattributed platform alerts carry a distinct signed
      // scope, so every forward status converges in the system receipt ledger.
      // Keep the legacy operational failure arm during rollout for messages
      // accepted before the sender began emitting operational-system.
      const statusApplied = await drizzle.transaction(async (tx: typeof drizzle) => {
        const applied = await recordTwilioMessageStatusReceipt(tx, {
          userId: null,
          messageSid,
          status,
          errorCode,
          operational: true,
        });
        if (!applied) return false;
        await tx.insert(schema.webhookHealth).values({
          userId: null,
          provider: "twilio_operational",
          eventType: status,
          outcome: errorCode ? `error_${errorCode}` : status,
        });
        return true;
      });
      if (!statusApplied || !deliveryFailed) return res.status(204).end();

      const context = {
        status,
        errorCode,
        messageSid: opaqueIdSuffixForLog(messageSid),
      };
      log.error("Unattributed Twilio operational SMS delivery failed", context);
      reportError(new Error("Unattributed Twilio operational SMS delivery failed"), {
        route: "/api/twilio-webhook/message-status",
        provider: "twilio_operational",
        ...context,
      });
    } else {
      await drizzle.insert(schema.auditLog).values({
        userId: null,
        action: "twilio.message_status_uncorrelated",
        provider: "twilio",
        eventType: "provider.webhook",
        severity: "warning",
        resourceType: "twilio_message",
        resourceId: messageSid,
        metadata: {
          status,
          error_code: errorCode,
          operational: operationalCallback,
        },
      });
      log.warn("Twilio message status correlation unavailable", {
        messageSid: opaqueIdSuffixForLog(messageSid),
        status,
        operationalCallback,
      });
      return res.status(503).send("Message status correlation unavailable");
    }
  } catch (error) {
    log.warn("Twilio message status persistence failed", {
      messageSid: opaqueIdSuffixForLog(messageSid),
      status,
      errorCode,
      error: getErrorMessage(error),
    });
    return res.status(503).send("Message status persistence unavailable");
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
        "BotBound's Twilio account reached a configured usage threshold.",
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
        subject: `[BotBound] Twilio ${recurring} usage threshold reached`,
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

router.use(tollfreeWebhookRouter);
router.use(baseRouter);

export default router;
