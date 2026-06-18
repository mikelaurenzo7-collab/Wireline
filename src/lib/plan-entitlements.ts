/**
 * Plan entitlements — single place for tier capabilities (OpenRouter, AI spend caps).
 * Stripe list prices stay in plan-catalog.ts; this module owns runtime gates.
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { isOwnerEmail } from "./auth-service";
import { planById, type StripePlanId } from "./plan-catalog";
import { drizzle } from "./server-context";
import type { PlanTier } from "./tenant-quotas";

/** Platform owners dogfood on scale entitlements without a Stripe row. */
export const FOUNDER_EFFECTIVE_PLAN_ID: StripePlanId = "scale";

const OPENROUTER_PLANS = new Set<StripePlanId>(["pro", "business", "enterprise"]);

/** Map wireline_subscriptions.plan → quota tier. */
export function subscriptionPlanToTier(planId: string | null | undefined): PlanTier {
  switch (planId) {
    case "enterprise":
    case "scale":
      return "scale" as PlanTier;
    case "business":
    case "business-growth":
      return "business-growth" as PlanTier;
    case "business-starter":
    case "business-lite":
    case "lite":
      return "business-starter" as PlanTier;
    case "pro":
    case "starter":
      return "starter" as PlanTier;
    case "personal-plus":
      return "personal-plus" as PlanTier;
    case "personal":
      return "personal" as PlanTier;
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

/** Apply OWNER_EMAIL / OWNER_EMAILS override before tier gates. */
export function effectivePlanIdForEntitlements(
  planId: string | null | undefined,
  email?: string | null,
): string | null {
  if (isOwnerEmail(email)) return FOUNDER_EFFECTIVE_PLAN_ID;
  return planId ?? null;
}

export function openRouterAllowedForEntitlements(
  planId: string | null | undefined,
  email?: string | null,
): boolean {
  return openRouterAllowedForPlanId(effectivePlanIdForEntitlements(planId, email));
}

export async function getEffectiveSubscriptionPlanId(
  userId: string,
  email?: string | null,
): Promise<string | null> {
  const planId = await getSubscriptionPlanId(userId);
  return effectivePlanIdForEntitlements(planId, email);
}

/** Default monthly AI spend hard-cap (USD) seeded on subscribe when no custom budget exists. */
export function defaultAiSpendBudgetUsdForTier(tier: PlanTier): number {
  switch (tier) {
    case "personal":
      return 15;
    case "starter":
      return 35;
    case "business-starter":
      return 45;
    case "pro":
      return 75;
    case "business":
      return 200;
    case "enterprise":
    case "scale":
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
