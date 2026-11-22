import { createHash } from "node:crypto";

import { and, eq, gte, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { opaqueIdSuffixForLog } from "./twilio-webhook-privacy";
import { firstContactSenderName } from "./sms-first-contact";
import type { MissedCallReason } from "./voice/missed-calls";

/**
 * One text back to a caller the Bot could not take, so a busy owner keeps the
 * lead. It sends only when every one of these holds:
 * - the owner turned it on (`preferences.missed_call_text_back.enabled`);
 * - the miss was the Bot being busy, at its daily limit or unavailable, never
 *   a billing stop the account cannot fund;
 * - the line the caller dialed is carrier-registered AND its approved
 *   campaign describes missed-call follow-up, read from Twilio;
 * - Twilio Lookup says the caller is in the US (+1 also covers Canada and
 *   the Caribbean);
 * - the caller has had no text, and no text-back attempt, from this
 *   workspace in 24 hours;
 * - the account is not being flooded with missed calls;
 * - and the shared send boundary admits it (entitlement, texting switch, Do
 *   Not Call, owned line, funding).
 * A durable attempt row is written just before Twilio is called, so a
 * timeout or retry can never text the caller twice. It never throws: the
 * owner's email alert is the primary path.
 */

export const MISSED_CALL_TEXT_BACK_REASONS: ReadonlySet<MissedCallReason> = new Set([
  "concurrency",
  "daily_minutes",
  "unavailable",
]);

/** More misses than this in an hour looks like a call flood; texting back would amplify it. */
const MISSED_CALLS_PER_HOUR_LIMIT = 10;
const PER_CALLER_WINDOW_MS = 24 * 60 * 60_000;
const US_E164 = /^\+1\d{10}$/;

export type MissedCallTextBackOutcome =
  | "sent"
  | "disabled"
  | "ineligible_reason"
  | "invalid_caller"
  | "not_us"
  | "not_covered"
  | "recently_texted"
  | "already_attempted"
  | "flood"
  | "refused"
  | "ambiguous"
  | "error";

export const MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION = "missed_call_text_back.attempted";

/** Pseudonymous caller key for the attempt row, so the audit log holds no phone number. */
export function missedCallerRef(userId: string, caller: string): string {
  return createHash("sha256").update(`${userId}:${caller}`).digest("hex");
}

/** Another missed call from this caller was already texted back inside the window. */
class RecentTextBackError extends Error {}

export function missedCallTextBackBody(brandName: string | null): string {
  const brand = brandName?.trim();
  return `${brand ? `${brand}: ` : ""}Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out.`;
}

export function missedCallTextBackEnabled(preferences: unknown): boolean {
  const envelope =
    preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : {};
  const setting = envelope.missed_call_text_back;
  return (
    !!setting &&
    typeof setting === "object" &&
    (setting as Record<string, unknown>).enabled === true
  );
}

type SendParams = {
  to: string;
  body: string;
  agentId?: string;
  fromNumber: string;
  idempotencyKey: string;
  beforeProviderAttempt: () => Promise<void>;
};

type Dependencies = {
  resolveSender: (userId: string, agentId: string | null) => Promise<string | null>;
  resolveRegistration: (e164: string) => Promise<{ status: string; coversMissedCalls?: boolean }>;
  /** ISO country of a number from Twilio Lookup (basic, no paid fields); null when unknown. */
  lookupCountry: (e164: string) => Promise<string | null>;
  send: (
    userId: string,
    params: SendParams,
  ) => Promise<{ ok: boolean; code?: string; reason?: string; providerOutcomeAmbiguous?: boolean }>;
  alreadyClaimedError: new () => Error;
};

async function defaultDependencies(): Promise<Dependencies> {
  const [{ resolveAgentSmsFromNumber }, { resolveSmsSenderRegistration }, twilioService] =
    await Promise.all([
      import("./agent-phone-lines"),
      import("./twilio-sms-registration"),
      import("./twilio-service"),
    ]);
  return {
    resolveSender: resolveAgentSmsFromNumber,
    resolveRegistration: resolveSmsSenderRegistration,
    lookupCountry: async (e164) => {
      const client = twilioService.getTwilioClient();
      if (!client) return null;
      const result = await client.lookups.v2.phoneNumbers(e164).fetch();
      return result.valid === true && typeof result.countryCode === "string"
        ? result.countryCode
        : null;
    },
    send: (userId, params) => twilioService.sendTenantMessage(userId, params),
    alreadyClaimedError: twilioService.SmsProviderAttemptAlreadyClaimedError,
  };
}

/**
 * The durable at-most-once latch, written just before the Twilio request: one
 * attempt per missed call ever, and one per caller per day across calls.
 */
async function claimAttempt(input: {
  userId: string;
  twilioCallSid: string;
  callerRef: string;
  alreadyClaimedError: new () => Error;
}): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('missed-call-text-back'), hashtext(${`${input.userId}:${input.callerRef}`}))`,
    );
    const [sameCall] = await tx
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, input.userId),
          eq(schema.auditLog.action, MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION),
          eq(schema.auditLog.resourceId, input.twilioCallSid),
        ),
      )
      .limit(1);
    if (sameCall) throw new input.alreadyClaimedError();
    const [sameCaller] = await tx
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.userId, input.userId),
          eq(schema.auditLog.action, MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION),
          sql`${schema.auditLog.metadata}->>'caller_ref' = ${input.callerRef}`,
          gte(schema.auditLog.createdAt, new Date(Date.now() - PER_CALLER_WINDOW_MS)),
        ),
      )
      .limit(1);
    if (sameCaller) throw new RecentTextBackError();
    await tx.insert(schema.auditLog).values({
      userId: input.userId,
      action: MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION,
      eventType: MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION,
      severity: "info",
      resourceType: "call",
      resourceId: input.twilioCallSid,
      metadata: { caller_ref: input.callerRef },
    });
  });
}

/** The line the caller dialed when it is this workspace's; otherwise the Bot's line. */
async function resolveDialedSender(
  input: { userId: string; agentId: string | null; calledNumber: string | null },
  resolveSender: Dependencies["resolveSender"],
): Promise<string | null> {
  const called = String(input.calledNumber || "").trim();
  if (US_E164.test(called)) {
    const [line] = await drizzle
      .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, input.userId),
          eq(schema.phoneNumbers.phoneNumber, called),
        ),
      )
      .limit(1);
    if (line) return line.phoneNumber;
  }
  return resolveSender(input.userId, input.agentId);
}

/** Call inside the tenant's store context. */
export async function maybeSendMissedCallTextBack(
  input: {
    userId: string;
    agentId: string | null;
    twilioCallSid: string;
    callerNumber: string | null;
    /** The line the caller dialed, when known. */
    calledNumber?: string | null;
    reason: MissedCallReason;
  },
  dependencies?: Dependencies,
): Promise<MissedCallTextBackOutcome> {
  const tenant = opaqueIdSuffixForLog(input.userId);
  try {
    if (!MISSED_CALL_TEXT_BACK_REASONS.has(input.reason)) return "ineligible_reason";
    const caller = String(input.callerNumber || "").trim();
    if (!US_E164.test(caller)) return "invalid_caller";

    const [[preferences], [settings]] = await Promise.all([
      drizzle
        .select({ preferences: schema.userPreferences.preferences })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, input.userId))
        .limit(1),
      drizzle
        .select({
          brandName: schema.settings.brandName,
          businessName: schema.settings.businessName,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, input.userId))
        .limit(1),
    ]);
    if (!missedCallTextBackEnabled(preferences?.preferences)) return "disabled";

    const deps = dependencies ?? (await defaultDependencies());
    const sender = await resolveDialedSender(
      { userId: input.userId, agentId: input.agentId, calledNumber: input.calledNumber ?? null },
      deps.resolveSender,
    );
    if (!sender) return "not_covered";
    const registration = await deps.resolveRegistration(sender);
    if (registration.status !== "registered" || registration.coversMissedCalls !== true) {
      log.info("Missed-call text-back skipped: campaign does not cover missed-call follow-up", {
        tenant_suffix: tenant,
        registration: registration.status,
      });
      return "not_covered";
    }

    const since = new Date(Date.now() - PER_CALLER_WINDOW_MS);
    const callerRef = missedCallerRef(input.userId, caller);
    const [[recentText], [recentAttempt], [recentMisses]] = await Promise.all([
      drizzle
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.smsMessages)
        .innerJoin(schema.smsThreads, eq(schema.smsThreads.id, schema.smsMessages.threadId))
        .where(
          and(
            eq(schema.smsMessages.userId, input.userId),
            eq(schema.smsMessages.direction, "out"),
            eq(schema.smsThreads.customerNumber, caller),
            gte(schema.smsMessages.createdAt, since),
          ),
        ),
      drizzle
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.userId, input.userId),
            eq(schema.auditLog.action, MISSED_CALL_TEXT_BACK_ATTEMPT_ACTION),
            sql`${schema.auditLog.metadata}->>'caller_ref' = ${callerRef}`,
            gte(schema.auditLog.createdAt, since),
          ),
        ),
      drizzle
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, input.userId),
            eq(schema.callLogs.outcomeTag, "missed"),
            gte(schema.callLogs.createdAt, new Date(Date.now() - 60 * 60_000)),
          ),
        ),
    ]);
    if (Number(recentText?.count ?? 0) > 0 || Number(recentAttempt?.count ?? 0) > 0) {
      return "recently_texted";
    }
    if (Number(recentMisses?.count ?? 0) > MISSED_CALLS_PER_HOUR_LIMIT) {
      log.warn("Missed-call text-back skipped: missed-call flood", { tenant_suffix: tenant });
      return "flood";
    }
    // +1 is shared with Canada and the Caribbean; Lookup decides. Unknown never texts.
    if ((await deps.lookupCountry(caller)) !== "US") return "not_us";

    let sent: Awaited<ReturnType<Dependencies["send"]>>;
    try {
      sent = await deps.send(input.userId, {
        to: caller,
        body: missedCallTextBackBody(
          firstContactSenderName({
            brandName: settings?.brandName,
            businessName: settings?.businessName,
          }),
        ),
        agentId: input.agentId ?? undefined,
        fromNumber: sender,
        idempotencyKey: `missed-call-text-back/${input.twilioCallSid}`,
        beforeProviderAttempt: () =>
          claimAttempt({
            userId: input.userId,
            twilioCallSid: input.twilioCallSid,
            callerRef,
            alreadyClaimedError: deps.alreadyClaimedError,
          }),
      });
    } catch (error) {
      if (error instanceof deps.alreadyClaimedError) return "already_attempted";
      if (error instanceof RecentTextBackError) return "recently_texted";
      throw error;
    }
    if (sent.providerOutcomeAmbiguous) {
      // Twilio may have delivered it; the attempt row keeps every retry from sending again.
      log.warn("Missed-call text-back outcome unknown; not retried", { tenant_suffix: tenant });
      return "ambiguous";
    }
    if (!sent.ok) {
      log.info("Missed-call text-back refused by the send boundary", {
        tenant_suffix: tenant,
        code: sent.code,
      });
      return "refused";
    }
    return "sent";
  } catch (error) {
    log.warn("Missed-call text-back failed", {
      tenant_suffix: tenant,
      error: getErrorMessage(error),
    });
    return "error";
  }
}
