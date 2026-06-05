/**
 * Plan entitlements — single place for tier capabilities (OpenRouter, AI spend caps).
 * Stripe list prices stay in plan-catalog.ts; this module owns runtime gates.
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { planById, type StripePlanId } from "./plan-catalog";
import { drizzle } from "./server-context";
import type { PlanTier } from "./tenant-quotas";

const OPENROUTER_PLANS = new Set<StripePlanId>(["pro", "business", "enterprise"]);

/** Map wireline_subscriptions.plan → quota tier. */
export function subscriptionPlanToTier(planId: string | null | undefined): PlanTier {
  switch (planId) {
    case "enterprise":
      return "enterprise";
    case "business":
      return "business";
    case "pro":
      return "pro";
    case "starter":
      return "starter";
    case "personal":
      return "personal";
    default:
      return "free";
  }
}

export function openRouterAllowedForTier(tier: PlanTier): boolean {
  if (tier === "free") return false;
  return OPENROUTER_PLANS.has(tier as StripePlanId);
}

export function openRouterAllowedForPlanId(planId: string | null | undefined): boolean {
  return openRouterAllowedForTier(subscriptionPlanToTier(planId));
}

/** Default monthly AI spend hard-cap (USD) seeded on subscribe when no custom budget exists. */
export function defaultAiSpendBudgetUsdForTier(tier: PlanTier): number {
  switch (tier) {
    case "personal":
      return 15;
    case "starter":
      return 35;
    case "pro":
      return 75;
    case "business":
      return 200;
    case "enterprise":
      return 500;
    default:
      return 5;
  }
}

/** Daily voice-minute burst cap derived from monthly plan allowance (~3.6× avg daily). */
export function voiceMinutesDailyQuotaForTier(tier: PlanTier): number {
  if (tier === "free") return PLAN_DEFAULTS_FREE_VOICE_DAILY;
  const plan = planById(tier as StripePlanId);
  if (!plan) return 15;
  return Math.max(10, Math.ceil((plan.voice_minutes_monthly / 30) * 3.6));
}

const PLAN_DEFAULTS_FREE_VOICE_DAILY = 10;

export async function getSubscriptionPlanId(userId: string): Promise<string | null> {
  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  return sub?.plan ?? null;
}
