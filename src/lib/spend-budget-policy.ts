export type HardSpendCapStatus =
  | "unavailable"
  | "disabled"
  | "within_limit"
  | "exceeded";

export type SpendBudgetPolicyInput = {
  budget:
    | {
        monthly_limit_usd: number;
        hard_cap: boolean;
        enabled: boolean;
      }
    | null;
  mtdCost: number;
};

/**
 * Resolve the enforcement state without touching the database.
 *
 * Missing or malformed active hard-cap state is never equivalent to an
 * Account Holder explicitly disabling the guard. Provider-spending work must
 * pause until Wireline can prove the configured limit.
 */
export function resolveHardSpendCapStatus(
  snapshot: SpendBudgetPolicyInput,
): HardSpendCapStatus {
  const budget = snapshot.budget;
  if (!budget) return "unavailable";
  if (!budget.enabled || !budget.hard_cap) return "disabled";

  const limit = budget.monthly_limit_usd;
  if (!Number.isFinite(limit) || !(limit > 0) || !Number.isFinite(snapshot.mtdCost)) {
    return "unavailable";
  }

  return snapshot.mtdCost >= limit ? "exceeded" : "within_limit";
}
