import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/routes/extra-agent-billing-atomic-routes.ts"),
  "utf8",
);

describe("Extra Agent Stripe SDK settlement contract", () => {
  it("charges increases atomically and grants only verified provider quantity", () => {
    expect(source).toContain('payment_behavior: "error_if_incomplete"');
    expect(source).toContain('proration_behavior: "always_invoice"');
    expect(source).toContain("extraAgentMutationIdempotencyKey");
    expect(source).toContain("hasPendingSubscriptionUpdate(subscription)");
    expect(source).toContain("verifiedQuantity !== target");
    expect(source).toContain(
      "persistQuantity(target, currentDbQuantity !== target, currentStripeQuantity)",
    );
    expect(source).not.toContain("stripe.invoices.list({");

    const providerVerification = source.lastIndexOf("stripe.subscriptions.retrieve(subscriptionId)");
    const entitlementCommit = source.lastIndexOf(
      "return persistQuantity(target, currentDbQuantity !== target, currentStripeQuantity)",
    );
    expect(providerVerification).toBeGreaterThan(-1);
    expect(entitlementCommit).toBeGreaterThan(-1);
    expect(providerVerification).toBeLessThan(entitlementCommit);
  });
});
