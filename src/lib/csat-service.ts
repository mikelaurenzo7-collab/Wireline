/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Post-call CSAT SMS — one-question satisfaction survey via text message.
 *
 * After a completed call (>30s, not voicemail/DNC), sends:
 *   "How was your call with [Agent]? Reply 1-5 (1=poor, 5=great).
 *    Reply STOP to unsubscribe."
 *
 * The inbound Twilio webhook detects a bare "1"–"5" reply and writes
 * the score to wireline_call_logs.csat_score on the most recent call
 * for that caller number.
 *
 * Gate checks:
 *   1. Tenant must have `csat_sms_enabled = true` in settings
 *   2. Twilio messaging must be configured for the tenant
 *   3. Customer number must be a real phone (not empty/null)
 *   4. Shared outbound dial gate (tenant DNC + TCPA; live-session follow-up
 *      skips quiet hours / 24h duplicate because the consumer just hung up)
 *
 * Opt-in only (csatSmsEnabled defaults to false). TCPA-compliant
 * because it includes STOP instructions and respects the DNC table.
 */

import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { evaluateOutboundDialGate } from "./outbound-dial-gate";
import { sendTenantMessage } from "./twilio-service";
import { sanitizePhone } from "./vapi-helpers";

/**
 * Send a post-call CSAT SMS to the caller.
 *
 * Best-effort — never throws. Returns `sent: false` with a reason
 * string when any gate check fails so the digest log is explicit.
 */
export async function sendPostCallCsatSms(params: {
  userId: string;
  customerNumber: string;
  agentName?: string | null;
  callLogId: string | bigint;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { userId, customerNumber, agentName } = params;

    // Gate 1: Tenant opt-in
    const [settings] = await drizzle
      .select({
        csatSmsEnabled: schema.settings.csatSmsEnabled,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    if (!settings?.csatSmsEnabled) {
      return { sent: false, reason: "csat_sms_disabled" };
    }

    // Gate 3: Valid phone number
    const e164 = sanitizePhone(customerNumber);
    if (!e164) {
      return { sent: false, reason: "invalid_customer_number" };
    }

    // Gate 4: Shared outbound compliance (tenant DNC + TCPA). Post-call CSAT
    // is a live-session follow-up — consumer just finished the call.
    const gate = await evaluateOutboundDialGate({
      userId,
      phone: e164,
      isMarketingCall: false,
      isLiveSessionFollowUp: true,
    });
    if (!gate.allowed) {
      return { sent: false, reason: gate.reason };
    }

    // Build the CSAT message
    const agent = agentName || "our team";
    const body = `How was your call with ${agent}? Reply 1-5 (1=poor, 5=great). Reply STOP to unsubscribe.`;

    const result = await sendTenantMessage(userId, {
      to: e164,
      body,
    });

    if (result?.ok) {
      log.info("CSAT SMS sent", { userId, to: e164 });
      return { sent: true };
    }
    return { sent: false, reason: "twilio_send_failed" };
  } catch (err: any) {
    log.warn("sendPostCallCsatSms error", { error: err?.message });
    return { sent: false, reason: "exception" };
  }
}

/**
 * Process an inbound CSAT reply (single digit 1–5).
 *
 * Called from the Twilio inbound SMS webhook when the body matches
 * `/^\s*[1-5]\s*$/`. Finds the most recent call log for this
 * (user, customer number) pair and writes the score.
 *
 * Returns true if a call log was found and updated.
 */
export async function processCsatReply(params: {
  userId: string;
  customerNumber: string;
  score: number;
}): Promise<boolean> {
  try {
    const { userId, customerNumber, score } = params;
    const e164 = sanitizePhone(customerNumber) || customerNumber;

    // Find the most recent call for this caller
    const [recent] = await drizzle
      .select({ id: schema.callLogs.id })
      .from(schema.callLogs)
      .where(and(eq(schema.callLogs.userId, userId), eq(schema.callLogs.customerNumber, e164)))
      .orderBy(desc(schema.callLogs.createdAt))
      .limit(1);

    if (!recent) {
      log.warn("CSAT reply — no matching call found", { userId, customerNumber: e164 });
      return false;
    }

    await drizzle
      .update(schema.callLogs)
      .set({ csatScore: score })
      .where(eq(schema.callLogs.id, recent.id));

    log.info("CSAT score recorded", {
      userId,
      callLogId: String(recent.id),
      score,
    });
    return true;
  } catch (err: any) {
    log.warn("processCsatReply error", { error: err?.message });
    return false;
  }
}
