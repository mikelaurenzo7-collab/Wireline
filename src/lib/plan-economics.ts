import {
  FLAT_OVERAGE_PER_MIN_USD,
  STRIPE_PLANS,
  type StripePlanId,
} from "./plan-catalog";

/**
 * Stable read model for the commercial limits that runtime and launch checks
 * consume. It derives every value from plan-catalog instead of duplicating
 * pricing or capacity constants.
 */
export interface PlanEconomics {
  planId: StripePlanId;
  voiceMinutesMonthly: number;
  overagePerMinuteUsd: number;
  includedPhoneNumbers: number;
  runtimeAllowanceUsdMonthly: number;
  aiSpendAllowanceUsdMonthly: number;
}

export function planEconomics(planId: StripePlanId | string): PlanEconomics | null {
  const plan = STRIPE_PLANS.find((candidate) => candidate.id === planId);
  if (!plan) return null;

  return {
    planId: plan.id,
    voiceMinutesMonthly: plan.voice_minutes_monthly,
    overagePerMinuteUsd: FLAT_OVERAGE_PER_MIN_USD,
    includedPhoneNumbers: plan.included_phone_numbers,
    runtimeAllowanceUsdMonthly: plan.runtime_allowance_usd_monthly,
    aiSpendAllowanceUsdMonthly: plan.ai_spend_allowance_usd_monthly,
  };
}
