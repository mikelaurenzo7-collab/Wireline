import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { assertStripeRefundInventoryCaughtUp } from "../src/lib/stripe-refund-lifecycle";

const refund = (extra: Record<string, unknown> = {}) =>
  ({
    id: "re_one",
    charge: "ch_one",
    payment_intent: "pi_one",
    amount: 1000,
    currency: "usd",
    status: "succeeded",
    ...extra,
  }) as Stripe.Refund;
const charge = (extra: Record<string, unknown> = {}) =>
  ({
    id: "ch_one",
    payment_intent: "pi_one",
    amount: 1000,
    amount_refunded: 1000,
    currency: "usd",
    ...extra,
  }) as Stripe.Charge;
describe("signed Stripe refund lifecycle is a causal inventory lower bound", () => {
  it.each(["succeeded", "failed", "canceled"])(
    "rejects stale pending inventory for a signed %s refund",
    (status) => {
      expect(() =>
        assertStripeRefundInventoryCaughtUp(charge(), [refund({ status: "pending" })], {
          expectedRefund: refund({ status }),
        }),
      ).toThrow("signed terminal event");
    },
  );
  it("rejects stale succeeded state for a signed failed return", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [refund()], {
        expectedRefund: refund({ status: "failed", failure_balance_transaction: "txn_return" }),
      }),
    ).toThrow("signed terminal event");
  });
  it.each([undefined, "txn_wrong"])(
    "requires the exact signed return transaction when inventory has %s",
    (failure_balance_transaction) => {
      expect(() =>
        assertStripeRefundInventoryCaughtUp(
          charge(),
          [refund({ status: "failed", failure_balance_transaction })],
          {
            expectedRefund: refund({ status: "failed", failure_balance_transaction: "txn_return" }),
          },
        ),
      ).toThrow("signed terminal event");
    },
  );
  it("accepts matching terminal proof and a later authoritative returned state superseding succeeded", () => {
    const returned = refund({ status: "failed", failure_balance_transaction: "txn_return" });
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [returned], { expectedRefund: returned }),
    ).not.toThrow();
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [returned], { expectedRefund: refund() }),
    ).not.toThrow();
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [refund()], { expectedRefund: refund() }),
    ).not.toThrow();
  });
  it.each([
    { amount: 900 },
    { charge: "ch_wrong" },
    { currency: "eur" },
    { payment_intent: "pi_wrong" },
  ])("rejects conflicting signed refund provenance %j", (extra) => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [refund()], { expectedRefund: refund(extra) }),
    ).toThrow("signed terminal event");
  });
  it("does not acknowledge a missing signed refund", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [], { expectedRefund: refund() }),
    ).toThrow("signed terminal event");
  });
  it("uses signed charge principal even if the refetched charge aggregate is zero", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(
        charge({ amount_refunded: 0 }),
        [refund({ status: "pending" })],
        { expectedCharge: charge() },
      ),
    ).toThrow("signed terminal event");
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge({ amount_refunded: 0 }), [refund()], {
        expectedCharge: charge(),
      }),
    ).not.toThrow();
  });
  it("permits later all-returned terminal proof to supersede a signed charge aggregate", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(
        charge({ amount_refunded: 0 }),
        [refund({ status: "canceled", failure_balance_transaction: "txn_return" })],
        { expectedCharge: charge({ refunds: { data: [refund()] } }) },
      ),
    ).not.toThrow();
  });
  it("does not let a historical return mask a newly pending refund", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(
        charge({ amount_refunded: 0 }),
        [
          refund({ status: "failed", failure_balance_transaction: "txn_return" }),
          refund({ id: "re_new", status: "pending" }),
        ],
        { expectedCharge: charge() },
      ),
    ).toThrow("signed terminal event");
  });
  it("does not let a historical return mask a newer refund completely absent from the API snapshot", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(
        charge({ amount_refunded: 0 }),
        [refund({ id: "re_old", status: "failed", failure_balance_transaction: "txn_old" })],
        { expectedCharge: charge() },
      ),
    ).toThrow("signed terminal event");
    expect(() =>
      assertStripeRefundInventoryCaughtUp(
        charge({ amount_refunded: 0 }),
        [refund({ id: "re_old", status: "failed", failure_balance_transaction: "txn_old" })],
        { expectedCharge: charge({ refunds: { data: [refund({ id: "re_new" })] } }) },
      ),
    ).toThrow("signed terminal event");
  });
  it("keeps failed events without return proof retryable even if the event itself omitted that proof", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [refund({ status: "failed" })], {
        expectedRefund: refund({ status: "failed" }),
      }),
    ).toThrow("signed terminal event");
  });
  it("requires any signed inline refund IDs to have terminal inventory proof", () => {
    expect(() =>
      assertStripeRefundInventoryCaughtUp(charge(), [refund()], {
        expectedCharge: charge({ refunds: { data: [refund({ id: "re_new" })] } }),
      }),
    ).toThrow("signed terminal event");
  });
});
