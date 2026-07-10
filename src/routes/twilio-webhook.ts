/* eslint-disable @typescript-eslint/no-explicit-any -- Twilio posts evolving form payloads. */
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, eq, or } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import { sanitizePhone } from "../lib/vapi-helpers";
import baseRouter from "./twilio-webhook-base";

const router = Router();

function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
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
 * OptOutType is present. Persist the state, then stop before the legacy route
 * emits a second confirmation message.
 */
router.post(
  "/api/twilio-webhook/sms",
  async (req: Request, res: Response, next: NextFunction) => {
    const optOutType = String(req.body?.OptOutType || "").toUpperCase();
    if (!optOutType) return next();
    if (!evaluateTwilioWebhookAuth(req).ok) return res.status(403).send(emptyTwiml());

    const userId = await tenantForSender(String(req.body?.To || ""));
    const customerNumber = sanitizePhone(
      String(req.body?.From || "").replace(/^whatsapp:/i, ""),
    );
    if (!userId || !customerNumber) return res.status(200).send(emptyTwiml());

    return tenantStore.run(userId, async () => {
      try {
        if (optOutType === "STOP") {
          await drizzle
            .insert(schema.dncList)
            .values({
              userId,
              phone: customerNumber,
              phoneRaw: String(req.body?.From || ""),
              reason: "opt-out",
              source: "twilio_advanced_opt_out",
            })
            .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });
        } else if (optOutType === "START") {
          await drizzle
            .delete(schema.dncList)
            .where(
              and(
                eq(schema.dncList.userId, userId),
                eq(schema.dncList.phone, customerNumber),
              ),
            );
        }

        await drizzle.insert(schema.consentLog).values({
          userId,
          customerNumber,
          event:
            optOutType === "STOP"
              ? "sms_opt_out"
              : optOutType === "START"
                ? "sms_opt_in"
                : "sms_help",
          rule: "twilio_advanced_opt_out",
          ruleVersion: "v1",
          state:
            optOutType === "STOP"
              ? "opted_out"
              : optOutType === "START"
                ? "opted_in"
                : "unchanged",
        });
      } catch (error) {
        log.error("Twilio Advanced Opt-Out persistence failed", {
          userId,
          optOutType,
          error: getErrorMessage(error),
        });
      }
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(emptyTwiml());
    });
  },
);

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

router.use(baseRouter);

export default router;
