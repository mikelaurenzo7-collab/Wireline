/**
 * Per-tenant unit economics — margin protection before scale.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { VOICE_VARIABLE_COST_PER_MIN_USD, planById } from "./plan-catalog";
import { getVoiceUsageSnapshot } from "./voice-usage";
import { getBudgetSnapshot } from "./spend-guards";

export const MARGIN_AT_RISK_THRESHOLD_PCT = 10;

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

  const uniqueIds = [...new Set(rows.map((r) => r.userId))];
  const economics = await Promise.all(uniqueIds.map((id) => getTenantEconomics(id)));
  return economics.filter((e) => e.at_risk).slice(0, limit);
}

export async function countAtRiskTenants(): Promise<number> {
  const rows = await drizzle
    .select({ userId: schema.quotaUsage.userId })
    .from(schema.quotaUsage)
    .where(eq(schema.quotaUsage.dimension, "voice_minutes_monthly"))
    .limit(500);

  const uniqueIds = [...new Set(rows.map((r) => r.userId))];
  let count = 0;
  for (const id of uniqueIds) {
    const econ = await getTenantEconomics(id);
    if (econ.at_risk) count++;
  }
  return count;
}

export function assertPlanMarginFloors(): { ok: boolean; violations: string[] } {
  const floors: Record<string, number> = {
    personal: 35,
    team: 28,
    business: 20,
  };
  const violations: string[] = [];
  for (const [id, floor] of Object.entries(floors)) {
    const plan = planById(id);
    if (!plan) continue;
    const margin = computeGrossMarginPct(plan.overage_per_min_usd, VOICE_VARIABLE_COST_PER_MIN_USD);
    if (margin != null && margin < floor) {
      violations.push(`${id}: overage margin ${margin}% < floor ${floor}%`);
    }
  }
  return { ok: violations.length === 0, violations };
}
