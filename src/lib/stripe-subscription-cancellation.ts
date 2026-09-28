import type Stripe from "stripe";

/**
 * Stripe's portal can schedule cancellation with cancel_at while leaving the
 * legacy cancel_at_period_end flag false. Keep the paid period unchanged and
 * only label that period as ending when the explicit date matches it exactly.
 * A different valid date still prevents automatic renewal-restoration logic.
 */
export function stripeSubscriptionCancellation(
  subscription: Pick<Stripe.Subscription, "cancel_at" | "cancel_at_period_end">,
  periodEnd: number | null,
): { scheduled: boolean; atPeriodEnd: boolean } {
  const explicitDate =
    Number.isSafeInteger(subscription.cancel_at) && (subscription.cancel_at ?? 0) > 0
      ? subscription.cancel_at
      : null;
  return {
    scheduled: subscription.cancel_at_period_end === true || explicitDate !== null,
    atPeriodEnd:
      explicitDate !== null
        ? explicitDate === periodEnd
        : subscription.cancel_at_period_end === true,
  };
}
