/**
 * Pre-call voice coverage gate.
 *
 * Paid plans may place a live call when they have at least one included minute
 * remaining or enough prepaid Conversation Balance for one billable attempt.
 * Free Builder cannot place live calls.
 */
import { and, eq } from "drizzle-orm";
import { getCreditBalanceUsd } from "./credit-wallet";
import { planById } from "./plan-catalog";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";

export const MIN_BILLABLE_MINUTES_BUFFER = 1;
const MONTHLY_DIMENSION = "voice_minutes_monthly";

export type VoiceWalletSnapshot = {
  plan_id: string | null;
  live_voice_enabled: boolean;
  balance_usd: number;
  minute_rate_usd: number;
  required_usd: number;
  included_minutes: number;
  included_minutes_used: number;
  included_minutes_remaining: number;
  sufficient: boolean;
};

function monthlyPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function getVoiceWalletSnapshot(userId: string): Promise<VoiceWalletSnapshot> {
  const [[sub], [usage], balance] = await Promise.all([
    drizzle
      .select({ plan: schema.subscriptions.plan, status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1),
    drizzle
      .select({ used: schema.quotaUsage.used })
      .from(schema.quotaUsage)
      .where(
        and(
          eq(schema.quotaUsage.userId, userId),
          eq(schema.quotaUsage.dimension, MONTHLY_DIMENSION),
          eq(schema.quotaUsage.periodKey, monthlyPeriodKey()),
        ),
      )
      .limit(1),
    getCreditBalanceUsd(userId),
  ]);

  const plan = planById(sub?.plan ?? "personal");
  const planId = plan?.id ?? null;
  const activeSubscription =
    !!sub?.plan && (sub.status === "active" || sub.status === "trialing");
  const liveVoiceEnabled = activeSubscription && planId !== "personal" && planId !== "enterprise";
  const minuteRate = plan?.overage_per_min_usd ?? 0.2;
  const includedMinutes = Math.max(0, plan?.voice_minutes_monthly ?? 0);
  const includedUsed = Number(usage?.used ?? 0);
  const includedRemaining = Math.max(0, includedMinutes - includedUsed);
  const requiredUsd = Math.round(minuteRate * MIN_BILLABLE_MINUTES_BUFFER * 100) / 100;
  const sufficient =
    liveVoiceEnabled &&
    (includedRemaining >= MIN_BILLABLE_MINUTES_BUFFER || balance >= requiredUsd);

  return {
    plan_id: planId,
    live_voice_enabled: liveVoiceEnabled,
    balance_usd: balance,
    minute_rate_usd: minuteRate,
    required_usd: requiredUsd,
    included_minutes: includedMinutes,
    included_minutes_used: includedUsed,
    included_minutes_remaining: includedRemaining,
    sufficient,
  };
}

export async function assertVoiceWalletSolvent(userId: string): Promise<void> {
  const snapshot = await getVoiceWalletSnapshot(userId);
  if (snapshot.sufficient) return;

  const noLivePlan = !snapshot.live_voice_enabled;
  const err = new Error(
    noLivePlan
      ? "A paid plan is required for live voice."
      : "Included minutes and Conversation Balance are depleted.",
  );
  (err as Error & { status: number; body: Record<string, unknown> }).status = 402;
  (err as Error & { status: number; body: Record<string, unknown> }).body = noLivePlan
    ? {
        code: "LIVE_PLAN_REQUIRED",
        error:
          "Free Builder is for setup and private simulation. Choose Starter, Team, or Business before placing live calls.",
        recovery_path: "/settings/billing",
        recovery_action: "choose_plan",
      }
    : {
        code: "VOICE_COVERAGE_DEPLETED",
        error:
          "Your included live-call minutes are used. Add Conversation Balance or wait for the next monthly reset.",
        balance_usd: snapshot.balance_usd,
        included_minutes_remaining: snapshot.included_minutes_remaining,
        required_usd: snapshot.required_usd,
        minute_rate_usd: snapshot.minute_rate_usd,
        recovery_path: "/settings/billing",
        recovery_action: "add_conversation_balance",
      };
  throw err;
}
