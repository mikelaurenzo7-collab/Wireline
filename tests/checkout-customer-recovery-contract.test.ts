import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/routes/launch-billing-checkout-atomic-routes.ts", import.meta.url),
  "utf8",
);
const stripeHelpers = readFileSync(
  new URL("../src/lib/stripe-helpers.ts", import.meta.url),
  "utf8",
);
const customerBinding = readFileSync(
  new URL("../src/lib/stripe-customer-binding.ts", import.meta.url),
  "utf8",
);

describe("checkout Stripe-customer recovery contract", () => {
  it("validates stored customer ownership and treats deleted or missing resources as stale", () => {
    expect(source).toContain("resolveOwnedStripeCustomer({");
    expect(customerBinding).toContain("stripe.customers.retrieve(customerId)");
    expect(customerBinding).toContain("customer.metadata?.wireline_user_id");
    expect(customerBinding).toContain('"deleted" in customer && customer.deleted');

    // The missing-resource test now lives in stripe-helpers so every Stripe
    // re-fetch shares one retry posture. This route used to carry a private
    // copy that read only the top-level `code`/`statusCode`; the Node SDK puts
    // the API error code on `raw.code` for StripeInvalidRequestError, so that
    // copy missed real resource_missing responses and threw where it should
    // have treated the stored customer as stale.
    expect(customerBinding).toContain("isMissingStripeResource");
    expect(customerBinding).not.toContain("function isMissingStripeResource");
    expect(stripeHelpers).toContain("export function isMissingStripeResource(error: unknown)");
    expect(stripeHelpers).toContain('stripeError?.code === "resource_missing"');
    expect(stripeHelpers).toContain('stripeError?.raw?.code === "resource_missing"');
    expect(stripeHelpers).toContain("stripeError?.statusCode === 404");
  });

  it("uses deterministic recovery and initial-customer idempotency keys", () => {
    expect(source).toContain("wireline-customer-recovery-${userId}-${existingCustomerId}");
    expect(source).toContain("wireline-customer-${userId}");
  });

  it("persists the durable operation before the subscription projection", () => {
    const operationWrite = source.indexOf(
      'await markCheckoutOperation(operationId, {\n        status: "creating"',
    );
    const projectionWrite = source.indexOf(
      "await persistStripeCustomerId(req.user.id, customerId)",
    );
    expect(operationWrite).toBeGreaterThan(-1);
    expect(projectionWrite).toBeGreaterThan(operationWrite);
  });

  it("keeps ambiguous customer and local-persistence outcomes resumable", () => {
    expect(source).toContain('failureCode: "customer_state_persistence_failed"');
    expect(source).toContain('failureCode: "stripe_customer_outcome_unknown"');
    expect(source.match(/code: "CHECKOUT_RECONCILING"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
