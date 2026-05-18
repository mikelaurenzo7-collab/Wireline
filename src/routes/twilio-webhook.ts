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
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { sanitizePhone } from "../lib/vapi-helpers";

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
  // Twilio posts as form-urlencoded; Express needs body-parser registered
  // upstream. The server-context entry point already mounts urlencoded.
  const from = (req.body?.From as string | undefined) || "";
  const to = (req.body?.To as string | undefined) || "";
  const body = (req.body?.Body as string | undefined) || "";
  const messageSid = (req.body?.MessageSid as string | undefined) || "";
  const trimmed = body.trim().toLowerCase();

  log.info("Twilio inbound SMS", {
    from: from.slice(0, 16),
    to: to.slice(0, 16),
    body: body.slice(0, 80),
    messageSid,
  });

  res.setHeader("Content-Type", "text/xml");

  if (!from || !to) {
    return res.status(400).send(twimlEmpty());
  }

  const tenantUserId = await lookupTenant(to);
  if (!tenantUserId) {
    // We received an SMS at a number we don't recognize. Log + drop.
    log.warn("Twilio webhook: unknown To-number", { to: to.slice(0, 16) });
    return res.status(200).send(twimlEmpty());
  }

  const fromNormalized = sanitizePhone(from);

  // ─── OPT-OUT FLOW ──────────────────────────────────────────────
  if (OPT_OUT_KEYWORDS.has(trimmed)) {
    try {
      // Add to DNC (idempotent — onConflictDoNothing on user_id+phone)
      await drizzle
        .insert(schema.dncList)
        .values({
          userId: tenantUserId,
          phone: fromNormalized,
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

      log.info("SMS opt-out processed", { tenant: tenantUserId, from: fromNormalized });
    } catch (e: any) {
      log.error("SMS opt-out write failed", { error: e?.message });
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
  if (OPT_IN_KEYWORDS.has(trimmed)) {
    try {
      await drizzle
        .delete(schema.dncList)
        .where(
          and(eq(schema.dncList.userId, tenantUserId), eq(schema.dncList.phone, fromNormalized)),
        );

      await drizzle.insert(schema.consentLog).values({
        userId: tenantUserId,
        customerNumber: fromNormalized,
        event: "sms_opt_in",
        rule: "start_keyword",
        ruleVersion: "v1",
        state: "opted_in",
      });

      log.info("SMS opt-in processed", { tenant: tenantUserId, from: fromNormalized });
    } catch (e: any) {
      log.error("SMS opt-in write failed", { error: e?.message });
    }

    return res.status(200).send(twimlReply("You have been resubscribed. Welcome back."));
  }

  // ─── TWO-WAY THREAD STORAGE ────────────────────────────────────
  // Persist the inbound message into the SMS inbox so operators can
  // see + reply from /inbox. Idempotent thread upsert keyed by
  // (user_id, customer_number). If the sms tables haven't been
  // migrated yet, the catch just logs and we still return 200 to
  // Twilio so the network doesn't retry.
  try {
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

  // No auto-reply for non-keyword messages — operator answers via /inbox.
  return res.status(200).send(twimlEmpty());
});

export default router;
