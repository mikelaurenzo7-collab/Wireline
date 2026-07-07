/**
 * Buyer-facing voice rate clarity — effective $/min by plan and Conversation Balance.
 */
import { CONVERSATION_BALANCE_PRESETS_USD } from "./conversation-balance";
import { STRIPE_PLANS, VOICE_VARIABLE_COST_PER_MIN_USD, type StripePlanId } from "./plan-catalog";

export type VoiceRateRow = {
  planId: StripePlanId | "balance";
  label: string;
  rateUsd: number;
  detail: string;
};

export function voiceRateForPlan(planId: StripePlanId): number {
  const plan = STRIPE_PLANS.find((item) => item.id === planId);
  return plan?.overage_per_min_usd ?? STRIPE_PLANS[0].overage_per_min_usd;
}

/** Published voice rates — Personal uses Conversation Balance; paid tiers use metered overage. */
export function publishedVoiceRates(): VoiceRateRow[] {
  const personal = STRIPE_PLANS.find((item) => item.id === "personal")!;
  const rows: VoiceRateRow[] = [
    {
      planId: "balance",
      label: "Conversation Balance",
      rateUsd: personal.overage_per_min_usd,
      detail:
        "Personal and top-up funding: live PSTN minutes draw from prepaid balance at this rate.",
    },
  ];
  for (const id of ["team", "business"] as const) {
    const plan = STRIPE_PLANS.find((item) => item.id === id)!;
    rows.push({
      planId: id,
      label: plan.name,
      rateUsd: plan.overage_per_min_usd,
      detail: `Metered voice overage after internal allowance — $${plan.overage_per_min_usd.toFixed(2)}/min.`,
    });
  }
  return rows;
}

export function estimateVoiceMinutesFromBalance(
  balanceUsd: number,
  ratePerMin = voiceRateForPlan("personal"),
): number {
  if (balanceUsd <= 0 || ratePerMin <= 0) return 0;
  return Math.floor(balanceUsd / ratePerMin);
}

export function formatVoiceMinutesEstimate(balanceUsd: number): string {
  const minutes = estimateVoiceMinutesFromBalance(balanceUsd);
  if (minutes <= 0) return "—";
  return `≈ ${minutes.toLocaleString()} min at current voice rate`;
}

export function conversationBalanceMinuteEstimates(): Array<{
  amountUsd: number;
  minutes: number;
}> {
  const rate = voiceRateForPlan("personal");
  return CONVERSATION_BALANCE_PRESETS_USD.map((amountUsd) => ({
    amountUsd,
    minutes: estimateVoiceMinutesFromBalance(amountUsd, rate),
  }));
}

export { VOICE_VARIABLE_COST_PER_MIN_USD };
