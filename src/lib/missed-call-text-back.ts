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
 * - the line is carrier-registered AND its approved campaign describes
 *   missed-call follow-up, read from Twilio;
 * - the caller has had no text from this workspace in 24 hours;
 * - the account is not being flooded with missed calls;
 * - and the shared send boundary admits it (entitlement, texting switch, Do
 *   Not Call, owned line, funding).
 * It never throws: the owner's email alert is the primary path.
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
  | "not_covered"
  | "recently_texted"
  | "flood"
  | "refused"
  | "error";

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

type Dependencies = {
  resolveSender: (userId: string, agentId: string | null) => Promise<string | null>;
  resolveRegistration: (e164: string) => Promise<{ status: string; coversMissedCalls?: boolean }>;
  send: (
    userId: string,
    params: { to: string; body: string; agentId?: string; idempotencyKey: string },
  ) => Promise<{ ok: boolean; code?: string; reason?: string }>;
};

async function defaultDependencies(): Promise<Dependencies> {
  const [{ resolveAgentSmsFromNumber }, { resolveSmsSenderRegistration }, { sendTenantMessage }] =
    await Promise.all([
      import("./agent-phone-lines"),
      import("./twilio-sms-registration"),
      import("./twilio-service"),
    ]);
  return {
    resolveSender: resolveAgentSmsFromNumber,
    resolveRegistration: resolveSmsSenderRegistration,
    send: (userId, params) =>
      sendTenantMessage(userId, { ...params, agentId: params.agentId ?? undefined }),
  };
}

/** Call inside the tenant's store context. */
export async function maybeSendMissedCallTextBack(
  input: {
    userId: string;
    agentId: string | null;
    twilioCallSid: string;
    callerNumber: string | null;
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
    const sender = await deps.resolveSender(input.userId, input.agentId);
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
    const [[recentText], [recentMisses]] = await Promise.all([
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
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, input.userId),
            eq(schema.callLogs.outcomeTag, "missed"),
            gte(schema.callLogs.createdAt, new Date(Date.now() - 60 * 60_000)),
          ),
        ),
    ]);
    if (Number(recentText?.count ?? 0) > 0) return "recently_texted";
    if (Number(recentMisses?.count ?? 0) > MISSED_CALLS_PER_HOUR_LIMIT) {
      log.warn("Missed-call text-back skipped: missed-call flood", { tenant_suffix: tenant });
      return "flood";
    }

    const sent = await deps.send(input.userId, {
      to: caller,
      body: missedCallTextBackBody(
        firstContactSenderName({
          brandName: settings?.brandName,
          businessName: settings?.businessName,
        }),
      ),
      agentId: input.agentId ?? undefined,
      idempotencyKey: `missed-call-text-back/${input.twilioCallSid}`,
    });
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
