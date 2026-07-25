/**
 * Per-tenant unit economics — margin protection before scale.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import {
  PAYMENT_PROCESSING_FIXED_USD,
  PAYMENT_PROCESSING_RATE,
  PHONE_NUMBER_COST_MONTHLY_USD,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  planById,
  type BillingInterval,
  type StripePlan,
} from "./plan-catalog";
import { getVoiceUsageSnapshot } from "./voice-usage";
import { getBudgetSnapshot } from "./spend-guards";

export const MARGIN_AT_RISK_THRESHOLD_PCT = 10;
/** Observed blended COGS above this triggers a pricing review alert. */
export const COGS_DRIFT_THRESHOLD_PER_MIN_USD = 0.14;

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
 * Annual is billed at a discount (roughly two months free) while the reserved
 * monthly COGS is unchanged, so the annual interval is always the tighter of
 * the two. Callers that guard pricing must check both — see
 * {@link assertPlanMarginFloors}.
 */
export function computePlanFullUtilizationMarginPct(
  plan: StripePlan,
  interval: BillingInterval = "month",
): number | null {
  const recurringRevenue =
    interval === "year" ? plan.price_usd_annual / 12 : plan.price_usd_monthly;
  if (!Number.isFinite(recurringRevenue) || recurringRevenue <= 0) return null;
  const paymentCost =
    interval === "year"
      ? (plan.price_usd_annual * PAYMENT_PROCESSING_RATE + PAYMENT_PROCESSING_FIXED_USD) / 12
      : plan.price_usd_monthly * PAYMENT_PROCESSING_RATE + PAYMENT_PROCESSING_FIXED_USD;
  const voiceCost = plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD;
  const numberCost = plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD;
  // Treat every included Runtime Allowance dollar as fully consumed COGS. This
  // intentionally understates margin because most optional actions cost less
  // than their customer-facing reserve.
  const totalCost = voiceCost + numberCost + plan.runtime_allowance_usd_monthly + paymentCost;
  return Math.round(((recurringRevenue - totalCost) / recurringRevenue) * 1000) / 10;
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

export function assertPlanMarginFloors(): { ok: boolean; violations: string[] } {
  // Catalog v6 (docs/PRICING_DECISION_2026-07-25.md): one flat $0.22 top-up
  // rate and a uniform 30% hard contribution floor at full utilization —
  // launch readiness enforces the same bar on every paid tier instead of the
  // old per-tier ladder.
  const overageFloors: Record<string, number> = {
    starter: 35,
    team: 35,
    business: 35,
    enterprise: 35,
  };
  const includedFloors: Record<string, number> = {
    starter: 30,
    team: 30,
    business: 30,
    enterprise: 30,
  };
  const violations: string[] = [];

  for (const id of Object.keys(overageFloors)) {
    const plan = planById(id);
    if (!plan) {
      violations.push(`${id}: plan missing from canonical catalog`);
      continue;
    }

    const overageMargin = computeGrossMarginPct(
      plan.overage_per_min_usd,
      VOICE_VARIABLE_COST_PER_MIN_USD,
    );
    const overageFloor = overageFloors[id];
    if (overageMargin == null || overageMargin < overageFloor) {
      violations.push(`${id}: overage margin ${overageMargin ?? "n/a"}% < floor ${overageFloor}%`);
    }

    const includedFloor = includedFloors[id];
    // Annual is the binding interval (discounted revenue, unchanged monthly
    // COGS). Checking only the monthly side would have let an annual plan sink
    // below its floor without ever tripping launch readiness.
    for (const interval of ["month", "year"] as const) {
      const includedMargin = computePlanFullUtilizationMarginPct(plan, interval);
      if (includedMargin == null || includedMargin < includedFloor) {
        violations.push(
          `${id}: ${interval}ly full-utilization contribution ${includedMargin ?? "n/a"}% < floor ${includedFloor}%`,
        );
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
