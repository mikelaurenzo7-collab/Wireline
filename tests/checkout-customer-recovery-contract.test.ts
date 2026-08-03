import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/routes/launch-billing-checkout-atomic-routes.ts", import.meta.url),
  "utf8",
);

describe("checkout Stripe-customer recovery contract", () => {
  it("validates stored customer ownership and treats deleted or missing resources as stale", () => {
    expect(source).toContain("stripe.customers.retrieve(customerId)");
    expect(source).toContain('customer.metadata?.wireline_user_id');
    expect(source).toContain('candidate?.code === "resource_missing"');
    expect(source).toContain('"deleted" in customer && customer.deleted');
  });

  it("uses deterministic recovery and initial-customer idempotency keys", () => {
    expect(source).toContain("wireline-customer-recovery-${userId}-${existingCustomerId}");
    expect(source).toContain("wireline-customer-${userId}");
  });

  it("persists the durable operation before the subscription projection", () => {
    const operationWrite = source.indexOf("await markCheckoutOperation(operationId, {\n        status: \"creating\"");
    const projectionWrite = source.indexOf("await persistStripeCustomerId(req.user.id, customerId)");
    expect(operationWrite).toBeGreaterThan(-1);
    expect(projectionWrite).toBeGreaterThan(operationWrite);
  });

  it("keeps ambiguous customer and local-persistence outcomes resumable", () => {
    expect(source).toContain('failureCode: "customer_state_persistence_failed"');
    expect(source).toContain('failureCode: "stripe_customer_outcome_unknown"');
    expect(source.match(/code: "CHECKOUT_RECONCILING"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
