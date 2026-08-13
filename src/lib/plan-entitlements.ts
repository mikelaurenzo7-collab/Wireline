/**
 * Plan entitlements — single place for runtime tier capabilities.
 * Stripe list prices and included minutes live in plan-catalog.ts.
 */
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { isOwnerEmail } from "./auth-service";
import {
  FREE_BUILDER_AI_ALLOWANCE_USD,
  planById,
  type StripePlanId,
} from "./plan-catalog";
import { drizzle } from "./server-context";
import type { PlanTier } from "./tenant-quotas";

/** Platform owners dogfood on enterprise entitlements without a Stripe row. */
export const FOUNDER_EFFECTIVE_PLAN_ID: StripePlanId = "enterprise";

/**
 * Free Builder funds private setup, training, and simulation only. This is a
 * deliberate monthly acquisition allowance, not a live-voice allowance and
 * not an arbitrary database fallback.
 *
 * Production audit evidence through 2026-08-05 measured 158 Director/workspace
 * turns at $0.062143 average cost. A $1.50 hard cap therefore covers roughly
 * 24 observed average turns while keeping free-account exposure bounded.
 */
export const FREE_BUILDER_SIMULATION_ALLOWANCE_USD = FREE_BUILDER_AI_ALLOWANCE_USD;

/** Map wireline_subscriptions.plan → runtime quota tier. */
export function subscriptionPlanToTier(planId: string | null | undefined): PlanTier {
  switch (planId) {
    case "enterprise":
    case "scale":
    case "custom":
    case "growth":
    case "business-plus":
      return "enterprise";
    case "business":
    case "pro":
    case "business-growth":
      return "business";
    case "team":
    case "shared":
    case "starter-plus":
    case "starterplus":
    case "plus":
      return "team";
    case "starter":
    case "business-starter":
    case "business-lite":
    case "lite":
    case "personal-plus":
    case "businessstarter":
    case "solo":
    case "starter-9":
      return "personal";
    case "personal":
      return "free";
    default:
      return "free";
  }
}

export function effectivePlanIdForEntitlements(
  planId: string | null | undefined,
  email?: string | null,
): string | null {
  if (isOwnerEmail(email)) return FOUNDER_EFFECTIVE_PLAN_ID;
  return planId ?? null;
}

export function subscriptionStatusGrantsEntitlements(
  status: string | null | undefined,
): boolean {
  return status === "active" || status === "trialing";
}

export async function getEffectiveSubscriptionPlanId(
  userId: string,
  email?: string | null,
): Promise<string | null> {
  if (isOwnerEmail(email)) return FOUNDER_EFFECTIVE_PLAN_ID;

  const [subscription] = await drizzle
    .select({
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (!subscriptionStatusGrantsEntitlements(subscription?.status)) return null;
  return subscription?.plan ?? null;
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
 * Paid tiers use the explicit AI-spend allowance independently reserved in the
 * catalog. It must not be derived from guaranteed voice or Runtime Allowance:
 * all three meters can be consumed in the same month. Free Builder receives a
 * small, explicit simulation allowance so setup and private training remain
 * useful without enabling live-provider work.
 */
export function defaultAiSpendBudgetUsdForTier(tier: PlanTier): number {
  if (tier === "free") return FREE_BUILDER_SIMULATION_ALLOWANCE_USD;
  const planId = PLAN_ID_FOR_TIER[tier];
  if (!planId) return FREE_BUILDER_SIMULATION_ALLOWANCE_USD;
  const plan = planById(planId);
  if (!plan) return FREE_BUILDER_SIMULATION_ALLOWANCE_USD;
  return plan.ai_spend_allowance_usd_monthly;
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
