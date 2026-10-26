/** Read-only planning model. No provider invoices or production state are read. */
import {
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  MANAGED_MAILBOX_COST_MONTHLY_USD,
  PHONE_NUMBER_COST_MONTHLY_USD,
  USAGE_PLAN,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  estimatedStripeCommercialFeesUsd,
} from "../../src/lib/plan-catalog.ts";
import {
  PUBLIC_USAGE_TIERS,
  USAGE_ADDONS,
  USAGE_METERS,
  usageTier,
} from "../../src/lib/usage-billing-catalog.ts";

export function sharedUsageEconomics(voiceCostPerMinuteUsd = VOICE_VARIABLE_COST_PER_MIN_USD) {
  if (!Number.isFinite(voiceCostPerMinuteUsd) || voiceCostPerMinuteUsd < 0)
    throw new Error("Voice cost must be finite and nonnegative.");
  const calls = USAGE_METERS.call_minutes;
  if (
    calls.included !== 0 ||
    calls.tiers.length !== 1 ||
    calls.tiers[0].upTo !== null ||
    !(calls.tiers[0].unitUsd > 0)
  )
    throw new Error("Update the economics model for the changed call rate card.");
  return PUBLIC_USAGE_TIERS.map((id) => {
    const plan = usageTier(id);
    const identityCostUsd =
      plan.includedNumbers * PHONE_NUMBER_COST_MONTHLY_USD +
      plan.includedEmailAddresses * MANAGED_MAILBOX_COST_MONTHLY_USD;
    const commercialFeesUsd = estimatedStripeCommercialFeesUsd(plan.monthlyUsd);
    const managedAiReserveUsd = USAGE_PLAN.ai_spend_allowance_usd_monthly;
    // Work allowance is retail value, never a second dollar-for-dollar COGS debit.
    const fullVoiceMinutes = plan.includedWorkUsd / calls.tiers[0].unitUsd;
    const voiceCostUsd = fullVoiceMinutes * voiceCostPerMinuteUsd;
    const fixedReserveUsd = identityCostUsd + commercialFeesUsd + managedAiReserveUsd;
    const voiceContributionUsd = plan.monthlyUsd - fixedReserveUsd - voiceCostUsd;
    // Additive reserve stress is deliberately conservative, not a claim that
    // two complete uses of the shared retail allowance occur simultaneously.
    const stressContributionUsd = voiceContributionUsd - plan.computerBudgetUsd;
    return {
      id,
      name: plan.name,
      monthlyUsd: plan.monthlyUsd,
      includedWorkUsd: plan.includedWorkUsd,
      identityCostUsd,
      commercialFeesUsd,
      managedAiReserveUsd,
      fullVoiceMinutes,
      voiceCostUsd,
      computerReserveUsd: plan.computerBudgetUsd,
      voiceContributionUsd,
      stressContributionUsd,
      stressMargin: stressContributionUsd / plan.monthlyUsd,
      stressBelowFloor: stressContributionUsd / plan.monthlyUsd < HARD_CONTRIBUTION_MARGIN_FLOOR,
      voiceBreakEvenPerMinuteUsd:
        (plan.monthlyUsd - fixedReserveUsd - plan.computerBudgetUsd) / fullVoiceMinutes,
    };
  });
}

/** Compare equal number/mail capacity at every piecewise-linear breakpoint. */
export function sharedUsageRetailComparisons() {
  return PUBLIC_USAGE_TIERS.flatMap((alternativeId) =>
    PUBLIC_USAGE_TIERS.filter((candidateId) => candidateId !== alternativeId).flatMap(
      (candidateId) => {
        const alternative = usageTier(alternativeId);
        const candidate = usageTier(candidateId);
        const numbers = Math.max(alternative.includedNumbers, candidate.includedNumbers);
        const emails = Math.max(
          alternative.includedEmailAddresses,
          candidate.includedEmailAddresses,
        );
        const fixed = (plan: typeof alternative | typeof candidate) =>
          plan.monthlyUsd +
          (numbers - plan.includedNumbers) * USAGE_ADDONS.number.usdMonthly +
          (emails - plan.includedEmailAddresses) * USAGE_ADDONS.email_address.usdMonthly;
        const differences = [0, alternative.includedWorkUsd, candidate.includedWorkUsd].map(
          (work) =>
            fixed(candidate) +
            Math.max(0, work - candidate.includedWorkUsd) -
            fixed(alternative) -
            Math.max(0, work - alternative.includedWorkUsd),
        );
        if (
          differences.some((difference) => difference < -1e-9) ||
          !differences.some((difference) => difference > 1e-9)
        )
          return [];
        return [
          {
            alternativeId,
            alternativeName: alternative.name,
            candidateId,
            candidateName: candidate.name,
            includedNumbers: numbers,
            includedEmailAddresses: emails,
            maximumSavingUsd: Math.max(...differences),
            // Bill comparison only: processing capacity can legitimately differ.
            alternativeComputerBudgetUsd: alternative.computerBudgetUsd,
            candidateComputerBudgetUsd: candidate.computerBudgetUsd,
          },
        ];
      },
    ),
  );
}
