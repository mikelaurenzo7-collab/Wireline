/**
 * Pre-call voice coverage gate.
 *
 * Billing is evaluated only before a new live action. Once a provider call has
 * started, Wireline lets it finish normally. If that completed call exceeds the
 * remaining included pool and prepaid balance, post-call completion grace records
 * the amount due and this gate blocks the next live action until coverage returns.
 */
import { and, eq } from "drizzle-orm";
import { getCreditBalanceUsd } from "./credit-wallet";
import { planById } from "./plan-catalog";
import { includedVoiceMinutes } from "./voice-usage";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";

export const MIN_BILLABLE_MINUTES_BUFFER = 1;
const MONTHLY_DIMENSION = "voice_minutes_monthly";

export type VoiceWalletSnapshot = {
  plan_id: string | null;
  live_voice_enabled: boolean;
  balance_usd: number;
  completion_grace_due_usd: number;
  minute_rate_usd: number;
  required_usd: number;
  included_minutes: number;
  included_minutes_used: number;
  included_minutes_remaining: number;
  current_call_policy: "finish_current_block_next";
  sufficient: boolean;
};

function monthlyPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function getVoiceWalletSnapshot(userId: string): Promise<VoiceWalletSnapshot> {
  const [[sub], [usage], [settingsRow], balanceRaw] = await Promise.all([
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
    drizzle
      .select({ extraAgents: schema.settings.extraAgents })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1),
    getCreditBalanceUsd(userId),
  ]);

  const plan = planById(sub?.plan ?? "personal");
  const planId = plan?.id ?? null;
  const activeSubscription = !!sub?.plan && (sub.status === "active" || sub.status === "trialing");
  const liveVoiceEnabled = activeSubscription && planId !== "personal";
  const minuteRate = plan?.overage_per_min_usd ?? 0.2;
  // Include the extra-agent add-on minutes the customer paid for — the usage
  // accounting (voice-usage.ts) already counts them, so the pre-call gate must
  // match or a customer with extra agents is blocked between their base and
  // paid-for minutes when balance is zero.
  const includedMinutes = includedVoiceMinutes(sub?.plan, settingsRow?.extraAgents).included;
  const includedUsed = Number(usage?.used ?? 0);
  const includedRemaining = Math.max(0, includedMinutes - includedUsed);
  const balance = Math.round(balanceRaw * 100) / 100;
  const completionGraceDue = Math.max(0, Math.round(-balance * 100) / 100);
  const requiredUsd = Math.round(minuteRate * MIN_BILLABLE_MINUTES_BUFFER * 100) / 100;
  const sufficient =
    liveVoiceEnabled &&
    completionGraceDue === 0 &&
    (includedRemaining >= MIN_BILLABLE_MINUTES_BUFFER || balance >= requiredUsd);

  return {
    plan_id: planId,
    live_voice_enabled: liveVoiceEnabled,
    balance_usd: balance,
    completion_grace_due_usd: completionGraceDue,
    minute_rate_usd: minuteRate,
    required_usd: requiredUsd,
    included_minutes: includedMinutes,
    included_minutes_used: includedUsed,
    included_minutes_remaining: includedRemaining,
    current_call_policy: "finish_current_block_next",
    sufficient,
  };
}

export async function assertVoiceWalletSolvent(userId: string): Promise<void> {
  const snapshot = await getVoiceWalletSnapshot(userId);
  if (snapshot.sufficient) return;

  const noLivePlan = !snapshot.live_voice_enabled;
  const completionGraceDue = snapshot.completion_grace_due_usd > 0;
  const err = new Error(
    noLivePlan
      ? "A paid plan is required for live voice."
      : completionGraceDue
        ? "A completed call has an outstanding completion-grace balance."
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
        current_call_policy: snapshot.current_call_policy,
      }
    : completionGraceDue
      ? {
          code: "VOICE_COMPLETION_GRACE_DUE",
          error:
            "Your previous call finished normally after prepaid coverage ran out. Add Conversation Balance before starting another live call.",
          balance_usd: snapshot.balance_usd,
          completion_grace_due_usd: snapshot.completion_grace_due_usd,
          included_minutes_remaining: snapshot.included_minutes_remaining,
          recovery_path: "/settings/billing",
          recovery_action: "restore_conversation_balance",
          current_call_policy: snapshot.current_call_policy,
        }
      : {
          code: "VOICE_COVERAGE_DEPLETED",
          error:
            "Your included live-call minutes are used. Add Conversation Balance or wait for the next monthly reset before starting another live call.",
          balance_usd: snapshot.balance_usd,
          included_minutes_remaining: snapshot.included_minutes_remaining,
          required_usd: snapshot.required_usd,
          minute_rate_usd: snapshot.minute_rate_usd,
          recovery_path: "/settings/billing",
          recovery_action: "add_conversation_balance",
          current_call_policy: snapshot.current_call_policy,
        };
  throw err;
}
