import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  disputeRestorationRequired,
  proportionalTopUpCreditUsd,
  runtimeAllowanceMovementUsd,
  subscriptionDisputeAllowancePortion,
} from "../src/lib/stripe-dispute-accounting";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("subscription Runtime Allowance refunds fail closed", () => {
  const middleware = read("src/middleware/stripe-runtime-allowance-retry.ts");
  const registry = read("src/server/register-api-routes.ts");

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

  it("scales a dispute by both the disputed charge share and base-plan share", () => {
    expect(subscriptionDisputeAllowancePortion(2_500, 10_000, 0.8)).toBeCloseTo(0.2);
    expect(subscriptionDisputeAllowancePortion(5_000, 10_000, 1)).toBeCloseTo(0.5);
    expect(subscriptionDisputeAllowancePortion(10_000, 10_000, 1)).toBe(1);
    expect(subscriptionDisputeAllowancePortion(10_000, 10_000, 0)).toBe(0);
    expect(subscriptionDisputeAllowancePortion(12_000, 10_000, 0.75)).toBe(0.75);
    expect(subscriptionDisputeAllowancePortion(-1, 10_000, 1)).toBe(0);
  });

  it("keeps reversal and restoration rounding exactly symmetric", () => {
    expect(runtimeAllowanceMovementUsd(144, 0.25)).toBe(36);
    expect(runtimeAllowanceMovementUsd(12, 1 / 3)).toBe(4);
    expect(runtimeAllowanceMovementUsd(10, 0.333)).toBe(3.33);
    expect(runtimeAllowanceMovementUsd(10, 2)).toBe(10);
  });

  it("restores only the disputed share of a purchased Runtime Balance", () => {
    expect(proportionalTopUpCreditUsd(2_500, 10_000, 40)).toBe(10);
    expect(proportionalTopUpCreditUsd(10_000, 10_000, 40)).toBe(40);
    expect(proportionalTopUpCreditUsd(20_000, 10_000, 40)).toBe(40);
    expect(proportionalTopUpCreditUsd(0, 10_000, 40)).toBe(0);
  });

  it("recognizes both Stripe won-dispute restoration event shapes", () => {
    expect(disputeRestorationRequired("charge.dispute.closed", "won")).toBe(true);
    expect(disputeRestorationRequired("charge.dispute.closed", "lost")).toBe(false);
    expect(disputeRestorationRequired("charge.dispute.funds_reinstated", "warning_closed")).toBe(
      true,
    );
    expect(disputeRestorationRequired("charge.dispute.updated", "won")).toBe(false);
  });

  it("lets credit top-ups retain the canonical wallet-refund and dispute-creation paths", () => {
    expect(middleware).toContain(
      'if (paymentIntent.metadata?.purpose === "credit_topup") return next()',
    );
    expect(middleware).toContain("restoreTopUpDisputeStrict");
  });

  it("passes the actual disputed amount into the subscription reversal", () => {
    expect(middleware).toContain("dispute.amount,");
    expect(middleware).toContain("subscriptionDisputeAllowancePortion(");
    expect(middleware).toContain("context.allowanceShare");
  });

  it("restores won disputes once and only after the corresponding reversal exists", () => {
    expect(middleware).toContain('eventType === "charge.dispute.closed"');
    expect(middleware).toContain('eventType === "charge.dispute.funds_reinstated"');
    expect(middleware).toContain('"subscription_runtime_allowance_dispute_restoration"');
    expect(middleware).toContain('"stripe_dispute_restoration"');
    expect(middleware).toContain("restoration arrived before its subscription allowance reversal");
    expect(middleware).toContain("restoration arrived before its top-up reversal");
  });

  it("fails closed when a subscription-funded charge has no resolvable Wireline owner", () => {
    expect(middleware).toContain("funded Runtime Allowance but its Wireline owner is unresolved");
    expect(middleware).not.toContain(
      'subscription allowance reversal skipped: subscription owner not found',
    );
  });

  it("never acknowledges a failed subscription allowance mutation", () => {
    const failureBlock = middleware.slice(
      middleware.indexOf('log.error("Stripe Runtime Balance integrity preflight failed'),
    );
    expect(failureBlock).toContain('next(AppError.fromHttpStatus(500, "Webhook handler failed"))');
    expect(failureBlock).not.toContain("res.json");
  });

  it("only responds success after the strict reversal resolves", () => {
    const refundBlock = middleware.slice(
      middleware.indexOf('if (event.type === "charge.refunded")'),
      middleware.indexOf('if (event.type === "charge.dispute.created")'),
    );
    const reverse = refundBlock.indexOf(
      'await reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, "refund")',
    );
    const marked = refundBlock.indexOf("await markStripeEventProcessed(event.id)");
    const successAck = refundBlock.indexOf(
      'res.json({ received: true, runtime_allowance_reversal: true });',
      reverse,
    );
    expect(reverse).toBeGreaterThan(-1);
    expect(marked).toBeGreaterThan(reverse);
    expect(successAck).toBeGreaterThan(marked);
  });

  it("claims stripe_events before acknowledging subscription reversals or restorations", () => {
    expect(middleware).toContain("claimStripeEventForPreflight");
    expect(middleware).toContain("markStripeEventProcessed");
    expect(middleware).toContain("releaseStripeEventClaim");
  });
});
