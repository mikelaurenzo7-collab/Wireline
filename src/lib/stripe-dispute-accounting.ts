export type StripeDisputeRestorationEvent =
  | "charge.dispute.closed"
  | "charge.dispute.funds_reinstated";

/** Clamp an arbitrary value to a finite 0..1 proportion. */
export function clampUnitInterval(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return Math.min(1, Math.max(0, fallback));
  return Math.min(1, Math.max(0, value));
}

/**
 * Portion of a subscription-funded Runtime Allowance affected by a dispute.
 *
 * The disputed share of the charge and the base-plan-funded share of the
 * invoice are independent factors. Multiplying both prevents a partial dispute
 * or an add-on-bearing invoice from clawing back allowance it did not fund.
 */
export function subscriptionDisputeAllowancePortion(
  disputeAmountCents: number,
  chargeAmountCents: number,
  basePlanInvoiceShare: number,
): number {
  const fundedShare = clampUnitInterval(basePlanInvoiceShare);
  if (!(fundedShare > 0) || !(disputeAmountCents > 0)) return 0;
  if (!(chargeAmountCents > 0)) return fundedShare;
  return clampUnitInterval(disputeAmountCents / chargeAmountCents) * fundedShare;
}

/**
 * Return the purchased Runtime Balance represented by a disputed share of its
 * PaymentIntent. Match the canonical top-up reversal's downward-cent rounding
 * so restoration can never return a cent more than the dispute removed.
 */
export function proportionalTopUpCreditUsd(
  disputeAmountCents: number,
  paymentIntentAmountCents: number,
  purchasedCreditUsd: number,
): number {
  if (!(purchasedCreditUsd > 0) || !(disputeAmountCents > 0)) return 0;
  const portion =
    paymentIntentAmountCents > 0
      ? clampUnitInterval(disputeAmountCents / paymentIntentAmountCents)
      : 1;
  return Math.floor(purchasedCreditUsd * portion * 100) / 100;
}

/**
 * Use the same downward-cent rounding for allowance reversals and restorations
 * so a won dispute can restore exactly what its creation event removed.
 */
export function runtimeAllowanceMovementUsd(totalAllowanceUsd: number, portion: number): number {
  if (!(totalAllowanceUsd > 0)) return 0;
  return Math.floor(totalAllowanceUsd * clampUnitInterval(portion) * 100) / 100;
}

/**
 * Stripe can report restored funds before or alongside the terminal won state.
 * Both event shapes are accepted; the ledger's dispute-id key deduplicates them.
 */
export function disputeRestorationRequired(
  eventType: string,
  disputeStatus: string | null | undefined,
): boolean {
  return (
    eventType === "charge.dispute.funds_reinstated" ||
    (eventType === "charge.dispute.closed" && disputeStatus === "won")
  );
}
