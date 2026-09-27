/**
 * Per-tenant unit economics — margin protection before scale.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import {
  VOICE_VARIABLE_COST_PER_MIN_USD,
  estimatedPlanMonthlyCosts,
  STRIPE_PLANS,
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  estimatedContributionMarginAtExpectedUsage,
  type BillingInterval,
  type StripePlan,
} from "./plan-catalog";
import { getVoiceUsageSnapshot } from "./voice-usage";
import { getBudgetSnapshot } from "./spend-guards";

export const MARGIN_AT_RISK_THRESHOLD_PCT = 10;
/**
 * Catalog-level pricing-review reference: fleet blended COGS above this means
 * the priced-in reserve no longer covers reality and pricing needs review.
 *
 * The reference is the reserve itself. The catalog must separately clear the
 * full contribution floor including mailbox capacity and commercial fees;
 * this rate alone is not proof of plan profitability. The economics report
 * and launch gate expose any price/allowance combination below that floor.
 *
 * This is a FLEET pricing bound, not a per-tenant health check: an individual
 * tenant's observed rate naturally varies above the modeled average, so
 * tenant-facing health (voice-reliability summary and its Insights tile)
 * compares against reserve × TENANT_OBSERVED_COGS_HEADROOM_RATIO instead.
 */
export const COGS_DRIFT_THRESHOLD_PER_MIN_USD = VOICE_VARIABLE_COST_PER_MIN_USD;

export type TenantEconomics = {
  user_id: string;
  plan_id: string | null;
  voice_minutes_used: number;
  voice_minutes_included: number;
  overage_minutes: number;
  overage_per_min_usd: number;
  revenue_per_min_usd: number | null;
  cogs_per_min_usd: number;
  gross_margin_pct: number | null;
  overage_revenue_usd: number;
  overage_cogs_usd: number;
  claude_mtd_usd: number;
  at_risk: boolean;
};

export function computeGrossMarginPct(revenuePerMin: number, cogsPerMin: number): number | null {
  if (!Number.isFinite(revenuePerMin) || revenuePerMin <= 0) return null;
  return Math.round(((revenuePerMin - cogsPerMin) / revenuePerMin) * 1000) / 10;
}

/**
 * Contribution margin at full included utilization for one billing interval.
 *
 * Annual is billed at the explicit package-specific discount while the reserved
 * monthly COGS is unchanged, so the annual interval is always the tighter of
 * the two. Callers that guard pricing must check both — see
 * {@link assertPlanMarginFloors}.
 */
export function computePlanFullUtilizationMarginPct(
  plan: StripePlan,
  interval: BillingInterval = "month",
): number | null {
  const costs = estimatedPlanMonthlyCosts(plan, interval);
  const recurringRevenue = costs.revenueUsd;
  if (!Number.isFinite(recurringRevenue) || recurringRevenue <= 0) return null;
  return Math.round(((recurringRevenue - costs.totalCostUsd) / recurringRevenue) * 1000) / 10;
}

export async function getTenantEconomics(userId: string): Promise<TenantEconomics> {
  const [usage, budget] = await Promise.all([
    getVoiceUsageSnapshot(userId),
    getBudgetSnapshot(userId).catch(() => ({ mtdCost: 0, budget: null, period: "" })),
  ]);

  const revenuePerMin = usage.overage_per_min_usd > 0 ? usage.overage_per_min_usd : null;
  const cogsPerMin = VOICE_VARIABLE_COST_PER_MIN_USD;
  const grossMarginPct =
    revenuePerMin != null ? computeGrossMarginPct(revenuePerMin, cogsPerMin) : null;

  const overageRevenue = usage.overage_cost_usd;
  const overageCogs = Math.round(usage.overage_minutes * cogsPerMin * 100) / 100;
  const atRisk =
    grossMarginPct != null
      ? grossMarginPct < MARGIN_AT_RISK_THRESHOLD_PCT
      : usage.overage_minutes > 0 && usage.overage_per_min_usd < cogsPerMin;

  return {
    user_id: userId,
    plan_id: usage.plan_id,
    voice_minutes_used: usage.voice_minutes_used,
    voice_minutes_included: usage.voice_minutes_included,
    overage_minutes: usage.overage_minutes,
    overage_per_min_usd: usage.overage_per_min_usd,
    revenue_per_min_usd: revenuePerMin,
    cogs_per_min_usd: cogsPerMin,
    gross_margin_pct: grossMarginPct,
    overage_revenue_usd: overageRevenue,
    overage_cogs_usd: overageCogs,
    claude_mtd_usd: budget.mtdCost,
    at_risk: atRisk,
  };
}

/** Tenants with active overage and thin/negative margin this month. */
export async function listAtRiskTenants(limit = 5): Promise<TenantEconomics[]> {
  const rows = await drizzle
    .select({ userId: schema.quotaUsage.userId })
    .from(schema.quotaUsage)
    .where(eq(schema.quotaUsage.dimension, "voice_minutes_monthly"))
    .limit(200);

  const uniqueIds = [...new Set(rows.map((row) => row.userId))];
  const economics = await Promise.all(uniqueIds.map((id) => getTenantEconomics(id)));
  return economics.filter((economy) => economy.at_risk).slice(0, limit);
}

export async function countAtRiskTenants(): Promise<number> {
  const rows = await drizzle
    .select({ userId: schema.quotaUsage.userId })
    .from(schema.quotaUsage)
    .where(eq(schema.quotaUsage.dimension, "voice_minutes_monthly"))
    .limit(500);

  const uniqueIds = [...new Set(rows.map((row) => row.userId))];
  let count = 0;
  for (const id of uniqueIds) {
    const economy = await getTenantEconomics(id);
    if (economy.at_risk) count++;
  }
  return count;
}

/** New-sale guard; legacy exposure remains visible without rewriting old promises. */
export function assertPlanMarginFloors(): {
  ok: boolean;
  violations: string[];
  legacyExposure: string[];
} {
  const violations: string[] = [];
  const legacyExposure: string[] = [];
  for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
    const findings = plan.catalogFamily === "legacy" ? legacyExposure : violations;
    if (plan.channels.includes("voice")) {
      const overageMargin = computeGrossMarginPct(
        plan.overage_per_min_usd,
        VOICE_VARIABLE_COST_PER_MIN_USD,
      );
      if (overageMargin == null || overageMargin < 35)
        findings.push(`${plan.id}: voice overage margin below 35%`);
    }
    for (const interval of ["month", "year"] as const) {
      const costs = estimatedPlanMonthlyCosts(plan, interval);
      const full = (costs.revenueUsd - costs.totalCostUsd) / costs.revenueUsd;
      const expected = estimatedContributionMarginAtExpectedUsage(plan, interval);
      if (full < HARD_CONTRIBUTION_MARGIN_FLOOR)
        findings.push(
          `${plan.id}: ${interval} full-use margin ${(full * 100).toFixed(2)}% below ${HARD_CONTRIBUTION_MARGIN_FLOOR * 100}%`,
        );
      if (expected < LAUNCH_CONTRIBUTION_MARGIN_FLOOR)
        findings.push(
          `${plan.id}: ${interval} expected-use margin ${(expected * 100).toFixed(2)}% below ${LAUNCH_CONTRIBUTION_MARGIN_FLOOR * 100}%`,
        );
    }
  }
  return { ok: violations.length === 0, violations, legacyExposure };
}
