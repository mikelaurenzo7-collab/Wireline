/** Buyer-facing extra-usage rate clarity for founder early access. */
import { CONVERSATION_BALANCE_PRESETS_USD } from "./conversation-balance";
import {
  FLAT_OVERAGE_PER_MIN_USD,
  STRIPE_PLANS,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  type StripePlanId,
} from "./plan-catalog";

export type VoiceRateRow = {
  planId: StripePlanId;
  label: string;
  rateUsd: number;
  includedMinutes: number;
  detail: string;
};

export function voiceRateForPlan(planId: StripePlanId): number {
  const plan = STRIPE_PLANS.find((item) => item.id === planId);
  return plan?.overage_per_min_usd ?? FLAT_OVERAGE_PER_MIN_USD;
}

export function publishedVoiceRates(): VoiceRateRow[] {
  return STRIPE_PLANS.filter((plan) => plan.price_usd_monthly > 0).map((plan) => ({
    planId: plan.id,
    label: plan.name.replace("Wireline ", ""),
    rateUsd: plan.overage_per_min_usd,
    includedMinutes: plan.voice_minutes_monthly,
    detail: `${plan.voice_minutes_monthly.toLocaleString()} minutes included monthly. Extra live usage draws from prepaid Runtime Balance at $${plan.overage_per_min_usd.toFixed(2)}/min.`,
  }));
}

export function estimateVoiceMinutesFromBalance(
  balanceUsd: number,
  ratePerMin = voiceRateForPlan("starter"),
): number {
  if (balanceUsd <= 0 || ratePerMin <= 0) return 0;
  return Math.floor(balanceUsd / ratePerMin);
}

export function formatVoiceMinutesEstimate(balanceUsd: number): string {
  const minutes = estimateVoiceMinutesFromBalance(balanceUsd);
  if (minutes <= 0) return "—";
  return `≈ ${minutes.toLocaleString()} extra min at Starter rate`;
}

export function conversationBalanceMinuteEstimates(): Array<{
  amountUsd: number;
  minutes: number;
}> {
  const rate = voiceRateForPlan("starter");
  return CONVERSATION_BALANCE_PRESETS_USD.map((amountUsd) => ({
    amountUsd,
    minutes: estimateVoiceMinutesFromBalance(amountUsd, rate),
  }));
}

export { VOICE_VARIABLE_COST_PER_MIN_USD };
