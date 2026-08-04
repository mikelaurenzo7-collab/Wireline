export type DisputeBalanceMovement = {
  amount?: number | null;
  currency?: string | null;
};

/** Clamp an arbitrary value to a finite 0..1 proportion. */
export function clampUnitInterval(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return Math.min(1, Math.max(0, fallback));
  return Math.min(1, Math.max(0, value));
}

/**
 * Resolve an actual dispute balance movement in the charge currency.
 *
 * `charge.dispute.created` can represent an inquiry with no funds withdrawn.
 * Wallet accounting therefore follows Stripe's balance transactions instead:
 * negative transactions are withdrawals, positive transactions are
 * reinstatements. Mismatched settlement currencies fail closed because their
 * cents are not comparable to the charge or PaymentIntent amount.
 */
export function disputeBalanceMovementCents(input: {
  disputeAmountCents: number;
  disputeCurrency: string;
  balanceTransactions: readonly DisputeBalanceMovement[];
  direction: "withdrawn" | "reinstated";
}): number {
  const expectedCurrency = input.disputeCurrency.trim().toLowerCase();
  let movement = 0;

  for (const transaction of input.balanceTransactions) {
    const rawAmount = Number(transaction.amount ?? 0);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;
    const relevant = input.direction === "withdrawn" ? rawAmount < 0 : rawAmount > 0;
    if (!relevant) continue;

    const currency = String(transaction.currency || "")
      .trim()
      .toLowerCase();
    if (!currency || currency !== expectedCurrency) {
      throw new Error(
        `Stripe dispute balance movement currency ${currency || "unknown"} does not match ${expectedCurrency || "unknown"}.`,
      );
    }
    movement += Math.abs(rawAmount);
  }

  const disputeAmount = Math.max(0, Math.trunc(input.disputeAmountCents || 0));
  return disputeAmount > 0 ? Math.min(disputeAmount, movement) : movement;
}

/**
 * Portion of a subscription-funded Runtime Allowance affected by an actual
 * Stripe balance movement.
 *
 * The movement share of the charge and the base-plan-funded share of the
 * invoice are independent factors. Multiplying both prevents a partial
 * chargeback or an add-on-bearing invoice from moving allowance it did not
 * fund.
 */
export function subscriptionDisputeAllowancePortion(
  movementAmountCents: number,
  chargeAmountCents: number,
  basePlanInvoiceShare: number,
): number {
  const fundedShare = clampUnitInterval(basePlanInvoiceShare);
  if (!(fundedShare > 0) || !(movementAmountCents > 0)) return 0;
  if (!(chargeAmountCents > 0)) return fundedShare;
  return clampUnitInterval(movementAmountCents / chargeAmountCents) * fundedShare;
}

/**
 * Return the purchased Runtime Balance represented by a Stripe balance
 * movement. Match the canonical top-up reversal's downward-cent rounding so a
 * later restoration can never return a cent more than the withdrawal removed.
 */
export function proportionalTopUpCreditUsd(
  movementAmountCents: number,
  paymentIntentAmountCents: number,
  purchasedCreditUsd: number,
): number {
  if (!(purchasedCreditUsd > 0) || !(movementAmountCents > 0)) return 0;
  const portion =
    paymentIntentAmountCents > 0
      ? clampUnitInterval(movementAmountCents / paymentIntentAmountCents)
      : 1;
  return Math.floor(purchasedCreditUsd * portion * 100) / 100;
}

/**
 * Use the same downward-cent rounding for allowance reversals and restorations
 * so reinstatement cannot return more than its corresponding withdrawal.
 */
export function runtimeAllowanceMovementUsd(totalAllowanceUsd: number, portion: number): number {
  if (!(totalAllowanceUsd > 0)) return 0;
  return Math.floor(totalAllowanceUsd * clampUnitInterval(portion) * 100) / 100;
}
