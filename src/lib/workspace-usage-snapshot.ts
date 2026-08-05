/**
 * Unified workspace usage for billing UI + Director composer indicator.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { getBudgetSnapshot, clearBudgetCache } from "./spend-guards";
import { planById } from "./plan-catalog";
import { getVoiceUsageSnapshot } from "./voice-usage";
import { getCreditBalanceUsd } from "./credit-wallet";
import { defaultAiSpendBudgetUsdForTier, subscriptionPlanToTier } from "./plan-entitlements";
import { quotaTracker } from "./server-context";

const INTERNAL_AI_TOKEN_DIMENSION = "claude_tokens_daily" as const;

export interface WorkspaceUsageSnapshot {
  plan_id: string | null;
  plan_name: string | null;
  voice_minutes_used: number;
  voice_minutes_included: number;
  voice_minutes_remaining: number;
  voice_usage_pct: number;
  overage_minutes: number;
  overage_per_min_usd: number;
  overage_cost_usd: number;
  period_key: string;
  reset_at: string;
  stripe_metered: false;
  /** Prepaid Conversation Balance. A negative value is completion grace due. */
  credit_balance_usd: number;
  completion_grace_due_usd: number;
  live_voice_blocked: boolean;
  current_call_policy: "finish_current_block_next";
  extra_usage_funding: "conversation_balance";
  ai_spend_usd: number;
  ai_spend_limit_usd: number;
  ai_spend_pct: number;
  ai_spend_hard_cap: boolean;
  ai_tokens_used_today: number;
  ai_tokens_daily_limit: number;
  ai_tokens_pct: number;
  /** Primary ring value — worst of voice vs AI spend (what burns margin fastest). */
  usage_pct: number;
  /** @deprecated Sidebar alias — same as voice_minutes_included */
  voice_minutes_cap: number;
}

function pct(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export async function getWorkspaceUsageSnapshot(userId: string): Promise<WorkspaceUsageSnapshot> {
  // These reads are independent — fetch them together to save round-trips.
  const [voice, snap, { profile }, tokenUsed, creditBalanceUsd] = await Promise.all([
    getVoiceUsageSnapshot(userId),
    getBudgetSnapshot(userId),
    quotaTracker.getProfile(userId),
    quotaTracker.getUsage(userId, INTERNAL_AI_TOKEN_DIMENSION),
    getCreditBalanceUsd(userId),
  ]);
  const plan = planById(voice.plan_id);
  const tier = subscriptionPlanToTier(voice.plan_id);

  let aiLimit = snap.budget?.enabled ? snap.budget.monthly_limit_usd : 0;
  const aiSpend = snap.mtdCost;
  let aiHardCap = !!snap.budget?.hard_cap;

  if (!(aiLimit > 0)) {
    aiLimit = defaultAiSpendBudgetUsdForTier(tier);
    aiHardCap = true;
  }

  // The persisted quota dimension keeps its historical key for compatibility;
  // every product/API response exposes this as managed AI usage.
  const tokenLimit = profile[INTERNAL_AI_TOKEN_DIMENSION];

  const voicePct = pct(voice.voice_minutes_used, voice.voice_minutes_included);
  const aiPct = pct(aiSpend, aiLimit);
  const tokenPct = pct(tokenUsed, tokenLimit);
  const creditBalanceRounded = Number(creditBalanceUsd.toFixed(2));
  const completionGraceDueUsd = Math.max(0, Number((-creditBalanceRounded).toFixed(2)));
  const freeBuilder = !plan || plan.id === "personal";
  const insufficientForNextAttempt =
    voice.voice_minutes_remaining < 1 && creditBalanceRounded < voice.overage_per_min_usd;
  const liveVoiceBlocked = freeBuilder || completionGraceDueUsd > 0 || insufficientForNextAttempt;

  return {
    plan_id: voice.plan_id,
    plan_name: plan?.name ?? null,
    voice_minutes_used: voice.voice_minutes_used,
    voice_minutes_included: voice.voice_minutes_included,
    voice_minutes_remaining: voice.voice_minutes_remaining,
    voice_usage_pct: voicePct,
    overage_minutes: voice.overage_minutes,
    overage_per_min_usd: voice.overage_per_min_usd,
    overage_cost_usd: voice.overage_cost_usd,
    period_key: voice.period_key,
    reset_at: voice.reset_at,
    stripe_metered: false,
    credit_balance_usd: creditBalanceRounded,
    completion_grace_due_usd: completionGraceDueUsd,
    live_voice_blocked: liveVoiceBlocked,
    current_call_policy: "finish_current_block_next",
    extra_usage_funding: "conversation_balance",
    ai_spend_usd: Number(aiSpend.toFixed(4)),
    ai_spend_limit_usd: aiLimit,
    ai_spend_pct: aiPct,
    ai_spend_hard_cap: aiHardCap,
    ai_tokens_used_today: tokenUsed,
    ai_tokens_daily_limit: tokenLimit,
    ai_tokens_pct: tokenPct,
    usage_pct: Math.max(voicePct, aiPct),
    voice_minutes_cap: voice.voice_minutes_included,
  };
}

/**
 * Seed the plan-default AI spend budget. Called at signup (free tier) and
 * from Stripe sync on every subscription change.
 *
 * Safety rule: the account holder may lower this guard, but cannot raise it
 * above the provider-cost envelope funded by the active plan. A provenance
 * flag lets Wireline move its own default after an upgrade or downgrade while
 * preserving every customer-selected limit, including one that exactly equals
 * a former or current managed default. Hard-cap enforcement is repaired if an
 * older row was disabled.
 *
 * `executor` lets a caller pass an open transaction so the seed participates
 * in the same tx as the user insert — without it, seeding during signup runs
 * on a separate pooled connection and the spend_budgets → users FK fails
 * against the still-uncommitted user row (silently dropping the seed).
 */
export async function ensureDefaultAiSpendBudget(
  userId: string,
  planId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle tx and the base client share the query surface but not a common exported type
  executor: any = drizzle,
): Promise<void> {
  const tier = subscriptionPlanToTier(planId);
  const limit = defaultAiSpendBudgetUsdForTier(tier);
  const [existing] = await executor
    .select({
      monthlyLimitUsd: schema.spendBudgets.monthlyLimitUsd,
      hardCap: schema.spendBudgets.hardCap,
      enabled: schema.spendBudgets.enabled,
      managedDefault: schema.spendBudgets.managedDefault,
      warnThresholdPct: schema.spendBudgets.warnThresholdPct,
    })
    .from(schema.spendBudgets)
    .where(eq(schema.spendBudgets.userId, userId))
    .limit(1);

  const current = Number(existing?.monthlyLimitUsd);
  const hasUsableCurrent = Number.isFinite(current) && current > 0;
  const managedDefault = existing ? existing.managedDefault === true : true;
  const nextLimit = existing
    ? managedDefault
      ? limit
      : hasUsableCurrent
        ? Math.min(current, limit)
        : limit
    : limit;
  const alreadySafe =
    existing &&
    Math.abs(current - nextLimit) <= 0.005 &&
    existing.hardCap === true &&
    existing.enabled === true &&
    existing.managedDefault === managedDefault;
  if (alreadySafe) return;

  await executor
    .insert(schema.spendBudgets)
    .values({
      userId,
      monthlyLimitUsd: nextLimit.toString(),
      hardCap: true,
      warnThresholdPct: existing?.warnThresholdPct ?? 80,
      enabled: true,
      managedDefault,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.spendBudgets.userId,
      set: {
        monthlyLimitUsd: nextLimit.toString(),
        hardCap: true,
        warnThresholdPct: existing?.warnThresholdPct ?? 80,
        enabled: true,
        managedDefault,
        updatedAt: new Date(),
      },
    });

  clearBudgetCache(userId);
}
