import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  disputeBalanceMovementCents,
  proportionalTopUpCreditUsd,
  runtimeAllowanceMovementUsd,
  subscriptionDisputeAllowancePortion,
} from "../src/lib/stripe-dispute-accounting";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Stripe Runtime Balance movements fail closed", () => {
  const middleware = read("src/middleware/stripe-runtime-allowance-retry.ts");
  const registry = read("src/server/register-api-routes.ts");
  const alignment = read("scripts/align-stripe-webhook-events.mjs");

  it("mounts the strict preflight before the legacy billing router", () => {
    const strictMount = registry.indexOf(
      'app.use("/api/stripe-webhook", stripeRuntimeAllowanceRetryPreflight)',
    );
    const billingMount = registry.indexOf('app.use("/api", billingRouter)');

    expect(strictMount).toBeGreaterThan(-1);
    expect(billingMount).toBeGreaterThan(strictMount);
  });

  it("uses authoritative refund objects and one idempotency key per partial refund", () => {
    expect(middleware).toContain("stripe.refunds.list");
    expect(middleware).toContain("starting_after: startingAfter");
    expect(middleware).toContain("refund.id,");
    expect(middleware).toContain("subscriptionDisputeAllowancePortion(");
    expect(middleware).not.toContain("amount_refunded under charge.id");
  });

  it("treats inquiry creation as notification-only and follows monetary events", () => {
    const created = middleware.indexOf('if (event.type === "charge.dispute.created")');
    const withdrawn = middleware.indexOf('eventType === "charge.dispute.funds_withdrawn"');
    const reinstated = middleware.indexOf('eventType === "charge.dispute.funds_reinstated"');

    expect(created).toBeGreaterThan(-1);
    expect(withdrawn).toBeGreaterThan(created);
    expect(reinstated).toBeGreaterThan(withdrawn);
    expect(middleware).toContain("dispute_financial_movement: false");
    expect(middleware).toContain('expand: ["balance_transactions"]');
    expect(middleware).not.toContain('eventType === "charge.dispute.closed"');
  });

  it("extracts actual withdrawn and reinstated cents from Stripe balance transactions", () => {
    const transactions = [
      { amount: -10_000, currency: "usd" },
      { amount: 8_000, currency: "usd" },
    ];
    expect(
      disputeBalanceMovementCents({
        disputeAmountCents: 10_000,
        disputeCurrency: "usd",
        balanceTransactions: transactions,
        direction: "withdrawn",
      }),
    ).toBe(10_000);
    expect(
      disputeBalanceMovementCents({
        disputeAmountCents: 10_000,
        disputeCurrency: "usd",
        balanceTransactions: transactions,
        direction: "reinstated",
      }),
    ).toBe(8_000);
    expect(
      disputeBalanceMovementCents({
        disputeAmountCents: 10_000,
        disputeCurrency: "usd",
        balanceTransactions: [],
        direction: "withdrawn",
      }),
    ).toBe(0);
  });

  it("rejects incomparable settlement currencies instead of guessing", () => {
    expect(() =>
      disputeBalanceMovementCents({
        disputeAmountCents: 10_000,
        disputeCurrency: "usd",
        balanceTransactions: [{ amount: -9_000, currency: "eur" }],
        direction: "withdrawn",
      }),
    ).toThrow(/currency eur does not match usd/);
  });

  it("scales allowance by both movement share and base-plan share", () => {
    expect(subscriptionDisputeAllowancePortion(2_500, 10_000, 0.8)).toBeCloseTo(0.2);
    expect(subscriptionDisputeAllowancePortion(5_000, 10_000, 1)).toBeCloseTo(0.5);
    expect(subscriptionDisputeAllowancePortion(10_000, 10_000, 1)).toBe(1);
    expect(subscriptionDisputeAllowancePortion(10_000, 10_000, 0)).toBe(0);
    expect(subscriptionDisputeAllowancePortion(12_000, 10_000, 0.75)).toBe(0.75);
    expect(subscriptionDisputeAllowancePortion(-1, 10_000, 1)).toBe(0);
  });

  it("keeps withdrawal and reinstatement rounding exactly symmetric", () => {
    expect(runtimeAllowanceMovementUsd(144, 0.25)).toBe(36);
    expect(runtimeAllowanceMovementUsd(12, 1 / 3)).toBe(4);
    expect(runtimeAllowanceMovementUsd(10, 0.333)).toBe(3.33);
    expect(runtimeAllowanceMovementUsd(10, 2)).toBe(10);
    expect(proportionalTopUpCreditUsd(3_335, 10_000, 10)).toBe(3.33);
  });

  it("owns both subscription and top-up dispute movements", () => {
    expect(middleware).toContain("reverseTopUpDisputeStrict");
    expect(middleware).toContain("restoreTopUpDisputeStrict");
    expect(middleware).toContain("reverseSubscriptionRuntimeAllowanceForChargeStrict");
    expect(middleware).toContain("restoreSubscriptionRuntimeAllowanceForDisputeStrict");
    expect(middleware).toContain('"stripe_dispute"');
    expect(middleware).toContain('"subscription_runtime_allowance_dispute_restoration"');
  });

  it("never restores more than the recorded withdrawal", () => {
    expect(middleware).toContain("Math.min(calculatedAmountUsd, reversedAmountUsd)");
    expect(middleware).toContain("reinstatement arrived before its subscription allowance withdrawal");
    expect(middleware).toContain("reinstatement arrived before its top-up withdrawal");
  });

  it("fails closed when a subscription-funded charge has no resolvable Wireline owner", () => {
    expect(middleware).toContain("funded Runtime Allowance but its Wireline owner is unresolved");
  });

  it("keeps endpoint subscriptions aligned with the preflight event owner", () => {
    expect(alignment).toContain("stripe-runtime-allowance-retry.ts");
    expect(alignment).toContain("extractHandledEvents(financialPreflight)");
    expect(alignment).toContain("extractHandledEvents(billingRoutes)");
  });

  it("never acknowledges a failed financial mutation", () => {
    const failureBlock = middleware.slice(
      middleware.indexOf('log.error("Stripe Runtime Balance integrity preflight failed'),
    );
    expect(failureBlock).toContain('next(AppError.fromHttpStatus(500, "Webhook handler failed"))');
    expect(failureBlock).not.toContain("res.json");
  });

  it("claims events before acknowledging movements", () => {
    expect(middleware).toContain("claimStripeEventForPreflight");
    expect(middleware).toContain("markStripeEventProcessed");
    expect(middleware).toContain("releaseStripeEventClaim");
  });
});
