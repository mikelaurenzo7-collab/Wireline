export type DisputeBalanceMovement = {
  amount?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
};

/** Clamp an arbitrary value to a finite 0..1 proportion. */
export function clampUnitInterval(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return Math.min(1, Math.max(0, fallback));
  return Math.min(1, Math.max(0, value));
}

/**
 * Resolve an actual dispute balance movement in the dispute currency.
 *
 * `charge.dispute.created` can represent an inquiry with no funds withdrawn.
 * Wallet accounting therefore follows Stripe's balance transactions instead:
 * negative transactions are withdrawals, positive transactions are
 * reinstatements. Stripe balance movements can use the account settlement
 * currency; when they do, `exchange_rate` converts the dispute currency into
 * the balance-transaction currency, so dividing restores comparable minor
 * units before computing the wallet proportion.
 */
export function disputeBalanceMovementCents(input: {
  disputeAmountCents: number;
  disputeCurrency: string;
  balanceTransactions: readonly DisputeBalanceMovement[];
  direction: "withdrawn" | "reinstated";
}): number {
  const expectedCurrency = input.disputeCurrency.trim().toLowerCase();
  if (!expectedCurrency) throw new Error("Stripe dispute currency is missing.");

  let movement = 0;
  for (const transaction of input.balanceTransactions) {
    const rawAmount = Number(transaction.amount ?? 0);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;
    const relevant = input.direction === "withdrawn" ? rawAmount < 0 : rawAmount > 0;
    if (!relevant) continue;

    const currency = String(transaction.currency || "")
      .trim()
      .toLowerCase();
    if (!currency) throw new Error("Stripe dispute balance movement currency is missing.");

    let comparableAmount = Math.abs(rawAmount);
    if (currency !== expectedCurrency) {
      const exchangeRate = Number(transaction.exchange_rate);
      if (!(Number.isFinite(exchangeRate) && exchangeRate > 0)) {
        throw new Error(
          `Stripe dispute balance movement currency ${currency} does not match ${expectedCurrency} and has no usable exchange rate.`,
        );
      }
      comparableAmount = comparableAmount / exchangeRate;
    }
    movement += Math.round(comparableAmount);
  }

  const rawDisputeAmount = Number(input.disputeAmountCents);
  const disputeAmount = Number.isFinite(rawDisputeAmount)
    ? Math.max(0, Math.trunc(rawDisputeAmount))
    : 0;
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
  if (
    !Number.isFinite(purchasedCreditUsd) ||
    !(purchasedCreditUsd > 0) ||
    !Number.isFinite(movementAmountCents) ||
    !(movementAmountCents > 0)
  ) {
    return 0;
  }
  const portion =
    Number.isFinite(paymentIntentAmountCents) && paymentIntentAmountCents > 0
      ? clampUnitInterval(movementAmountCents / paymentIntentAmountCents)
      : 1;
  return Math.floor(purchasedCreditUsd * portion * 100) / 100;
}

/**
 * Use the same downward-cent rounding for allowance reversals and restorations
 * so reinstatement cannot return more than its corresponding withdrawal.
 */
export function runtimeAllowanceMovementUsd(totalAllowanceUsd: number, portion: number): number {
  if (!Number.isFinite(totalAllowanceUsd) || !(totalAllowanceUsd > 0)) return 0;
  return Math.floor(totalAllowanceUsd * clampUnitInterval(portion) * 100) / 100;
}
