/**
 * Plan entitlements — single place for runtime tier capabilities.
 * Stripe list prices and included minutes live in plan-catalog.ts.
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { isOwnerEmail } from "./auth-service";
import {
  VOICE_VARIABLE_COST_PER_MIN_USD,
  planById,
  type StripePlanId,
} from "./plan-catalog";
import { drizzle } from "./server-context";
import type { PlanTier } from "./tenant-quotas";

/** Platform owners dogfood on enterprise entitlements without a Stripe row. */
export const FOUNDER_EFFECTIVE_PLAN_ID: StripePlanId = "enterprise";

const OPENROUTER_PLANS = new Set<StripePlanId>(["business", "enterprise"]);

/** Map wireline_subscriptions.plan → runtime quota tier. */
export function subscriptionPlanToTier(planId: string | null | undefined): PlanTier {
  switch (planId) {
    case "enterprise":
    case "scale":
    case "custom":
      return "enterprise";
    case "business":
    case "pro":
    case "business-growth":
      return "business";
    case "team":
    case "shared":
      return "team";
    case "starter":
    case "business-starter":
    case "business-lite":
    case "lite":
    case "personal-plus":
      return "personal";
    case "personal":
      return "free";
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

const PLAN_ID_FOR_TIER: Partial<Record<PlanTier, StripePlanId>> = {
  personal: "starter",
  team: "team",
  business: "business",
  enterprise: "enterprise",
};

/**
 * Default account-level provider-spend envelope.
 *
 * This is not an additional customer allowance. It is a fail-safe around the
 * provider COGS already funded by guaranteed voice plus the plan's Runtime
 * Allowance. Deriving it from the commercial catalog prevents a low-price plan
 * from silently inheriting an unrelated $20–$500 legacy spend ceiling.
 */
export function defaultAiSpendBudgetUsdForTier(tier: PlanTier): number {
  const planId = PLAN_ID_FOR_TIER[tier];
  if (!planId) return 0.5;
  const plan = planById(planId);
  if (!plan) return 0.5;
  const fundedProviderEnvelope =
    plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD +
    plan.runtime_allowance_usd_monthly;
  return Math.ceil(fundedProviderEnvelope * 100) / 100;
}

/** Daily burst caps are guardrails, not included-minute promises. */
const VOICE_BURST_DAILY: Record<PlanTier, number> = {
  free: 0,
  personal: 30,
  team: 120,
  business: 300,
  enterprise: 1_000,
};

export function voiceMinutesDailyQuotaForTier(tier: PlanTier): number {
  return VOICE_BURST_DAILY[tier] ?? 0;
}

export async function getSubscriptionPlanId(userId: string): Promise<string | null> {
  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  return sub?.plan ?? null;
}
