/**
 * Plan entitlements — single place for tier capabilities (OpenRouter, AI spend caps).
 * Stripe list prices stay in plan-catalog.ts; this module owns runtime gates.
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { isOwnerEmail } from "./auth-service";
import type { StripePlanId } from "./plan-catalog";
import { drizzle } from "./server-context";
import type { PlanTier } from "./tenant-quotas";

/** Platform owners dogfood on enterprise entitlements without a Stripe row. */
export const FOUNDER_EFFECTIVE_PLAN_ID: StripePlanId = "enterprise";

const OPENROUTER_PLANS = new Set<StripePlanId>(["business", "enterprise"]);

/** Map wireline_subscriptions.plan → quota tier. */
export function subscriptionPlanToTier(planId: string | null | undefined): PlanTier {
  switch (planId) {
    case "enterprise":
    case "scale":
    case "custom":
      return "enterprise" as PlanTier;
    case "business":
    case "starter":
    case "pro":
    case "business-growth":
      return "business" as PlanTier;
    case "team":
    case "business-starter":
    case "business-lite":
    case "lite":
    case "personal-plus":
      return "team" as PlanTier;
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
    case "team":
      return 45;
    case "business":
      return 75;
    case "enterprise":
      return 500;
    default:
      return 5;
  }
}

/** Daily voice-minute burst cap — independent of billing (no included-minute pools). */
const VOICE_BURST_DAILY: Record<PlanTier, number> = {
  free: 10,
  personal: 10,
  team: 60,
  business: 144,
  enterprise: 360,
};

export function voiceMinutesDailyQuotaForTier(tier: PlanTier): number {
  return VOICE_BURST_DAILY[tier] ?? 10;
}

export async function getSubscriptionPlanId(userId: string): Promise<string | null> {
  const [sub] = await drizzle
    .select({ plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  return sub?.plan ?? null;
}
