import { and, eq, gte, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { sanitizePhone } from "../agent-runtime-helpers";
import { resolveCanonicalAppUrl } from "../app-url";
import { drizzle, log, tenantStore } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { opaqueIdSuffixForLog } from "../twilio-webhook-privacy";

/**
 * Why a caller reached no one. Admission reasons come from the SIP admission
 * check; "unavailable" covers a carrier fallback with no known cause.
 */
export type MissedCallReason =
  | "concurrency"
  | "coverage"
  | "completion_grace"
  | "daily_minutes"
  | "subscription"
  | "unavailable";

/** One line the owner reads in Calls History, saying why and what to do. */
export const MISSED_CALL_SUMMARIES: Record<MissedCallReason, string> = {
  concurrency: "Missed while your Bot was on another call.",
  coverage: "Missed because this month's included minutes are used. Add minutes in Billing.",
  completion_grace: "Missed because a call balance is due. Settle it in Billing.",
  daily_minutes: "Missed because today's call-minute limit was reached.",
  subscription: "Missed because live calls are paused for this account. Check Billing.",
  unavailable: "Missed because your Bot could not take the call.",
};

const BILLING_REASONS: ReadonlySet<MissedCallReason> = new Set([
  "coverage",
  "completion_grace",
  "subscription",
]);

export const MISSED_CALL_OUTCOME = "missed";

/** Owner alerts per account per hour; History keeps every missed call past this. */
const MISSED_CALL_ALERTS_PER_HOUR = 10;

/**
 * One History row per missed call, keyed on the Twilio call so a voicemail
 * left on the same call upgrades this row instead of adding a second one.
 */
export function missedCallKey(twilioCallSid: string): string {
  return `twilio-missed:${twilioCallSid}`;
}

/**
 * Voicemail records the caller, so it is the operator's explicit choice
 * (state recording-consent rules apply). Off, a missed caller is released
 * and the owner is alerted with the number to call back.
 */
export function missedCallVoicemailEnabled(): boolean {
  return process.env.WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED?.trim().toLowerCase() === "true";
}

const VOICEMAIL_PROMPT =
  "Sorry, no one can take your call right now. Please leave your name, number, and a short message after the tone.";

/**
 * TwiML that takes a voicemail. The recording and its transcript reach the
 * owner through /api/twilio-webhook/voicemail-complete and
 * /voicemail-transcription. Twilio transcribes recordings up to 120 seconds.
 */
export function voicemailTwiml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
    `<Say voice="Polly.Joanna-Neural" language="en-US">${VOICEMAIL_PROMPT}</Say>` +
    '<Record action="/api/twilio-webhook/voicemail-complete" method="POST" maxLength="120" timeout="5" playBeep="true" transcribe="true" transcribeCallback="/api/twilio-webhook/voicemail-transcription"/>' +
    "<Hangup/></Response>"
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appUrl(pathname: string): string {
  const canonical = resolveCanonicalAppUrl();
  const base = "error" in canonical ? "https://botbound.app" : canonical.url;
  return new URL(pathname, `${base.replace(/\/+$/, "")}/`).toString();
}

/** The owner email for one missed call: who, why, and the next step. */
export function buildMissedCallEmail(input: {
  callerNumber: string | null;
  reason: MissedCallReason;
}): { subject: string; text: string; html: string } {
  const caller = input.callerNumber?.trim() || "an unknown number";
  const why = MISSED_CALL_SUMMARIES[input.reason];
  const next = BILLING_REASONS.has(input.reason)
    ? { label: "Open Billing", url: appUrl("/settings/billing") }
    : { label: "Open Calls", url: appUrl("/phone?tab=logs") };
  return {
    subject: input.callerNumber
      ? `Missed call from ${caller}`
      : "Missed call on your BotBound line",
    text: [
      `Your Bot missed a call from ${caller}.`,
      why,
      "",
      input.callerNumber ? "Call them back while the lead is warm." : null,
      `${next.label}: ${next.url}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
    html: [
      `<p>Your Bot missed a call from <strong>${escapeHtml(caller)}</strong>.</p>`,
      `<p>${escapeHtml(why)}</p>`,
      input.callerNumber ? "<p>Call them back while the lead is warm.</p>" : "",
      `<p><a href="${escapeHtml(next.url)}">${escapeHtml(next.label)}</a></p>`,
    ].join(""),
  };
}

async function alertOwner(input: {
  userId: string;
  twilioCallSid: string;
  callerNumber: string | null;
  reason: MissedCallReason;
}): Promise<void> {
  const [recent] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.callLogs)
    .where(
      and(
        eq(schema.callLogs.userId, input.userId),
        eq(schema.callLogs.outcomeTag, MISSED_CALL_OUTCOME),
        gte(schema.callLogs.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    );
  if (Number(recent?.count ?? 0) > MISSED_CALL_ALERTS_PER_HOUR) {
    log.warn("Missed-call alert skipped: hourly alert limit reached", {
      tenant_suffix: opaqueIdSuffixForLog(input.userId),
    });
    return;
  }
  const { pickAccountHolderEmail } = await import("../post-call-digest");
  const to = await pickAccountHolderEmail(input.userId);
  if (!to) return;
  const { sendTenantEmail } = await import("../email-service");
  const sent = await sendTenantEmail({
    userId: input.userId,
    action: "missed_call_owner_notification",
    to,
    ...buildMissedCallEmail(input),
    idempotencyKey: `missed-call/${input.twilioCallSid}`,
  });
  if (!sent.ok && sent.disposition !== "suppressed") {
    log.warn("Missed-call owner alert was not accepted", {
      tenant_suffix: opaqueIdSuffixForLog(input.userId),
      error: sent.error,
    });
  }
}

/**
 * Record a missed call in History and, unless voicemail is on (a left
 * voicemail alerts the owner itself), alert the owner. Never throws: nothing
 * here may hold up the carrier response. A repeat for the same call is a
 * no-op, so the first writer's reason stands and the owner hears once.
 */
export async function recordMissedCall(input: {
  userId: string;
  agentId: string | null;
  twilioCallSid: string;
  callerNumber: string | null;
  reason: MissedCallReason;
}): Promise<void> {
  if (!input.twilioCallSid) return;
  try {
    await tenantStore.run(input.userId, async () => {
      const callerNumber = input.callerNumber
        ? sanitizePhone(input.callerNumber) || input.callerNumber
        : null;
      const [inserted] = await drizzle
        .insert(schema.callLogs)
        .values({
          userId: input.userId,
          vapiCallId: missedCallKey(input.twilioCallSid),
          agentId: input.agentId,
          direction: "inbound",
          customerNumber: callerNumber,
          durationSeconds: 0,
          summary: MISSED_CALL_SUMMARIES[input.reason],
          outcomeTag: MISSED_CALL_OUTCOME,
          intentLabel: "missed",
          endedReason: `declined-${input.reason}`,
        })
        .onConflictDoNothing({ target: schema.callLogs.vapiCallId })
        .returning({ id: schema.callLogs.id });
      if (inserted && !missedCallVoicemailEnabled()) {
        await alertOwner({ ...input, callerNumber });
      }
    });
  } catch (error) {
    log.warn("Missed call could not be recorded", {
      tenant_suffix: opaqueIdSuffixForLog(input.userId),
      reason: input.reason,
      error: getErrorMessage(error),
    });
  }
}
