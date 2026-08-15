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
import { refundReservedTenantMessageAttempt, sendTenantMessage } from "./twilio-service";
import { sanitizePhone } from "./vapi-helpers";
import { phoneSuffixForLog } from "./twilio-webhook-privacy";

export type PreparedPostCallCsatSms = {
  userId: string;
  customerNumber: string;
  body: string;
};

export type PostCallCsatPreparation =
  { ready: true; message: PreparedPostCallCsatSms } | { ready: false; reason: string };

/**
 * Run every no-send compliance and preference gate before an at-most-once
 * provider attempt is claimed. Unexpected database failures deliberately
 * reject so the durable job can retry without losing the CSAT opportunity.
 */
export async function preparePostCallCsatSms(params: {
  userId: string;
  customerNumber: string;
  agentName?: string | null;
  callLogId: string | bigint;
}): Promise<PostCallCsatPreparation> {
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
    return { ready: false, reason: "csat_sms_disabled" };
  }

  // Gate 3: Valid phone number
  const e164 = sanitizePhone(customerNumber);
  if (!e164) {
    return { ready: false, reason: "invalid_customer_number" };
  }

  // Gate 4: Shared outbound compliance (tenant + federal DNC and TCPA).
  // Post-call CSAT is a live-session follow-up, so quiet hours and the 24-hour
  // duplicate-call check do not apply; opt-outs always do.
  const gate = await evaluateOutboundDialGate({
    userId,
    phone: e164,
    isMarketingCall: false,
    isLiveSessionFollowUp: true,
  });
  if (!gate.allowed) {
    return { ready: false, reason: gate.reason };
  }

  const agent = agentName || "our team";
  return {
    ready: true,
    message: {
      userId,
      customerNumber: e164,
      body: `How was your call with ${agent}? Reply 1-5 (1=poor, 5=great). Reply STOP to unsubscribe.`,
    },
  };
}

/** Send one already-gated CSAT through the shared paid/carrier boundary. */
export async function sendPreparedPostCallCsatSms(
  prepared: PreparedPostCallCsatSms,
  options: {
    idempotencyKey: string;
    reservationAttempt: number;
    beforeProviderAttempt: () => Promise<void>;
  },
): Promise<{
  sent: boolean;
  reason?: string;
  providerSid?: string;
  code?: string;
  providerOutcomeAmbiguous?: boolean;
  doNotResend?: boolean;
}> {
  const result = await sendTenantMessage(prepared.userId, {
    to: prepared.customerNumber,
    body: prepared.body,
    idempotencyKey: options.idempotencyKey,
    reservationAttempt: options.reservationAttempt,
    beforeProviderAttempt: options.beforeProviderAttempt,
  });

  if (result.ok) {
    log.info("CSAT SMS accepted", {
      userId: prepared.userId,
      providerSid: result.sid,
      reconciliationPending: result.reconciliationPending === true,
    });
    return { sent: true, providerSid: result.sid };
  }
  return {
    sent: false,
    reason: result.reason || "twilio_send_failed",
    ...(result.code ? { code: result.code } : {}),
    ...(result.providerOutcomeAmbiguous ? { providerOutcomeAmbiguous: true } : {}),
    ...(result.doNotResend ? { doNotResend: true } : {}),
  };
}

/** Reconcile every earlier no-provider reserve before opening a new attempt. */
export async function reconcilePriorPostCallCsatReservations(
  prepared: PreparedPostCallCsatSms,
  options: { idempotencyKey: string; currentAttempt: number },
): Promise<void> {
  const currentAttempt = Math.max(1, Math.floor(options.currentAttempt));
  for (let attempt = 1; attempt < currentAttempt; attempt += 1) {
    await refundReservedTenantMessageAttempt({
      userId: prepared.userId,
      idempotencyKey: options.idempotencyKey,
      reservationAttempt: attempt,
      channel: "sms",
    });
  }
}

/** Compatibility wrapper for callers that do not need durable phase control. */
export async function sendPostCallCsatSms(params: {
  userId: string;
  customerNumber: string;
  agentName?: string | null;
  callLogId: string | bigint;
  idempotencyKey?: string;
  reservationAttempt?: number;
  beforeProviderAttempt?: () => Promise<void>;
}): Promise<{
  sent: boolean;
  reason?: string;
  providerSid?: string;
  code?: string;
  providerOutcomeAmbiguous?: boolean;
  doNotResend?: boolean;
}> {
  const prepared = await preparePostCallCsatSms(params);
  if (!prepared.ready) return { sent: false, reason: prepared.reason };
  return sendPreparedPostCallCsatSms(prepared.message, {
    idempotencyKey:
      params.idempotencyKey || `post-call-csat/${params.userId}/${String(params.callLogId)}`,
    reservationAttempt: params.reservationAttempt || 1,
    beforeProviderAttempt: params.beforeProviderAttempt || (async () => undefined),
  });
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
      log.warn("CSAT reply — no matching call found", {
        userId,
        customerNumber: phoneSuffixForLog(e164),
      });
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
