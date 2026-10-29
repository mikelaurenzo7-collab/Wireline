export const DEFAULT_MONTHLY_GOODWILL_CAP_CENTS = 10000; // $100.00
export const DEFAULT_PER_RESOLUTION_CAP_CENTS = 2500; // $25.00

export interface GoodwillWalletPolicy {
  monthlyCapCents: number; // default $100.00 (10000)
  perResolutionCapCents: number; // default $25.00 (2500)
  currentMonthSpentCents: number;
}

export function evaluateGoodwillCredit(
  policy: GoodwillWalletPolicy,
  requestedAmountCents: number
): { approved: boolean; reason?: string; newCurrentMonthSpentCents: number } {
  if (requestedAmountCents <= 0) {
    return {
      approved: false,
      reason: "Credit amount must be greater than 0 cents.",
      newCurrentMonthSpentCents: policy.currentMonthSpentCents,
    };
  }

  if (requestedAmountCents > policy.perResolutionCapCents) {
    return {
      approved: false,
      reason: `Requested credit ($${(requestedAmountCents / 100).toFixed(2)}) exceeds per-resolution cap of $${(policy.perResolutionCapCents / 100).toFixed(2)}.`,
      newCurrentMonthSpentCents: policy.currentMonthSpentCents,
    };
  }

  const projectedSpend = policy.currentMonthSpentCents + requestedAmountCents;
  if (projectedSpend > policy.monthlyCapCents) {
    return {
      approved: false,
      reason: `Requested credit ($${(requestedAmountCents / 100).toFixed(2)}) exceeds remaining monthly goodwill budget ($${((policy.monthlyCapCents - policy.currentMonthSpentCents) / 100).toFixed(2)}).`,
      newCurrentMonthSpentCents: policy.currentMonthSpentCents,
    };
  }

  return {
    approved: true,
    newCurrentMonthSpentCents: projectedSpend,
  };
}
