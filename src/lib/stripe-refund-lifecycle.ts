import type Stripe from "stripe";

export type StripeRefundLifecycleExpectation = {
  expectedRefund?: Stripe.Refund;
  expectedCharge?: Stripe.Charge;
};
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
const returned = (refund: Stripe.Refund) =>
  (refund.status === "failed" || refund.status === "canceled") &&
  !!idOf(refund.failure_balance_transaction);
const terminal = (refund: Stripe.Refund) => refund.status === "succeeded" || returned(refund);
function staleInventory(): never {
  throw new Error(
    "Stripe refund inventory has not caught up with the signed terminal event. Retry reconciliation.",
  );
}

/** A signed lifecycle event is a causal lower bound on subsequent API reads. */
export function assertStripeRefundInventoryCaughtUp(
  charge: Stripe.Charge,
  refunds: Stripe.Refund[],
  expectation: StripeRefundLifecycleExpectation,
): void {
  const { expectedRefund, expectedCharge } = expectation;
  if (expectedRefund && expectedCharge) staleInventory();
  if (expectedRefund) {
    const observed = refunds.find((refund) => refund.id === expectedRefund.id);
    if (
      !observed ||
      !["succeeded", "failed", "canceled"].includes(expectedRefund.status ?? "") ||
      idOf(expectedRefund.charge) !== charge.id ||
      observed.amount !== expectedRefund.amount ||
      observed.currency !== expectedRefund.currency ||
      (idOf(expectedRefund.payment_intent) &&
        idOf(observed.payment_intent) !== idOf(expectedRefund.payment_intent)) ||
      (idOf(expectedRefund.failure_balance_transaction) &&
        idOf(observed.failure_balance_transaction) !==
          idOf(expectedRefund.failure_balance_transaction)) ||
      ((expectedRefund.status === "failed" || expectedRefund.status === "canceled") &&
        !returned(observed)) ||
      (observed.status !== expectedRefund.status &&
        !(expectedRefund.status === "succeeded" && returned(observed)))
    )
      staleInventory();
    return;
  }
  if (!expectedCharge) return;
  if (
    expectedCharge.id !== charge.id ||
    expectedCharge.amount !== charge.amount ||
    expectedCharge.currency !== charge.currency ||
    idOf(expectedCharge.payment_intent) !== idOf(charge.payment_intent) ||
    !Number.isSafeInteger(expectedCharge.amount_refunded) ||
    expectedCharge.amount_refunded < 0 ||
    expectedCharge.amount_refunded > charge.amount
  )
    staleInventory();
  if (!expectedCharge.amount_refunded) return;
  const signedRefunds = expectedCharge.refunds?.data ?? [];
  if (
    signedRefunds.some(
      (signed) =>
        !refunds.some(
          (refund) =>
            refund.id === signed.id && refund.amount === signed.amount && terminal(refund),
        ),
    )
  )
    staleInventory();
  const succeededCents = refunds.reduce(
    (sum, refund) => sum + (refund.status === "succeeded" ? refund.amount : 0),
    0,
  );
  if (succeededCents >= expectedCharge.amount_refunded) return;
  // A historical return alone cannot prove a newer refund is even present in
  // this API snapshot. Supersession needs signed active refund identities whose
  // principal covers the signed aggregate, each now resolved in the inventory.
  const identifiedCents = signedRefunds.reduce(
    (sum, refund) =>
      sum +
      (["succeeded", "pending", "requires_action"].includes(refund.status ?? "")
        ? refund.amount
        : 0),
    0,
  );
  if (!Number.isSafeInteger(identifiedCents) || identifiedCents < expectedCharge.amount_refunded)
    staleInventory();
}
