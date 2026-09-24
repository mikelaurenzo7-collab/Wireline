import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Stripe Checkout modernization contract", () => {
  it("keeps the Node SDK, runtime, and operational scripts on one API generation", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const packageLock = JSON.parse(read("package-lock.json")) as {
      packages?: Record<string, { version?: string }>;
    };
    expect(packageJson.dependencies?.stripe).toBe("^22.6.0");
    expect(packageLock.packages?.["node_modules/stripe"]?.version).toBe("22.6.0");

    const helpers = read("src/lib/stripe-helpers.ts");
    const apiVersion = read("src/lib/stripe-api-version.ts");
    expect(apiVersion).toContain('"2026-08-26.dahlia"');
    expect(helpers).toContain("export { STRIPE_API_VERSION }");
    const aligner = read("scripts/align-stripe-webhook-events.mjs");
    expect(aligner).toContain("const API_VERSION = getPinnedStripeApiVersion()");
    expect(aligner).toContain("evaluateStripeWebhookReadiness(");

    for (const file of [
      "scripts/deactivate-retired-stripe-default-prices.mjs",
      "scripts/audit-stripe-product-copy-live.mjs",
      "scripts/audit-stripe-catalog-live.mjs",
      "scripts/setup-stripe-catalog.mjs",
      "scripts/audit-stripe-account-identity-live.mjs",
    ]) {
      expect(read(file), file).toContain('const API_VERSION = "2026-08-26.dahlia"');
    }
  });

  it("uses Invoice Payments after Basil removed Charge.invoice", () => {
    const helpers = read("src/lib/stripe-helpers.ts");
    const billing = read("src/routes/billing-routes.ts");
    const preflight = read("src/middleware/stripe-runtime-allowance-retry.ts");

    expect(helpers).toContain("stripe.invoicePayments.list");
    expect(helpers).toContain(
      'payment: { type: "payment_intent", payment_intent: paymentIntentId }',
    );
    expect(helpers).toContain("invoiceIds.size > 1");
    expect(billing).toContain("await reverseSubscriptionRuntimeAllowanceForChargeStrict(");
    expect(preflight).toContain("await stripeInvoiceIdForCharge(charge)");
    expect(billing).not.toMatch(/\bcharge\.invoice\b/);
    expect(preflight).not.toMatch(/\bcharge\.invoice\b/);
  });

  it("shares fulfillment between signed webhooks and authenticated redirects", () => {
    const webhook = read("src/routes/billing-routes.ts");
    const redirect = read("src/routes/launch-billing-checkout-atomic-routes.ts");
    const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");
    const billingPage = read("src/pages/BillingSettings.tsx");
    const checkoutReturn = read("src/lib/billing-checkout-return.ts");

    expect(webhook).toContain("fulfillStripeCheckoutSession(session");
    expect(redirect).toContain("fulfillStripeCheckoutSession(session");
    expect(fulfillment).toContain('type: "stripe_session"');
    expect(fulfillment).toContain("id: session.id");
    expect(fulfillment).toContain("if (!paymentSettled) return result;");
    const subscriptionBranch = fulfillment.slice(
      fulfillment.indexOf('if (session.mode === "subscription")'),
      fulfillment.indexOf('if (session.mode !== "payment"'),
    );
    expect(subscriptionBranch.indexOf("if (!paymentSettled) return result;")).toBeLessThan(
      subscriptionBranch.indexOf("stripe.subscriptions.retrieve"),
    );
    expect(subscriptionBranch).toContain(
      "const userId = session.metadata?.wireline_user_id?.trim()",
    );
    expect(subscriptionBranch).toContain(".returning({ userId: schema.settings.userId })");
    expect(fulfillment).toContain("has no BotBound workspace");
    expect(checkoutReturn).toContain('params.get("balance") === "success"');
    expect(checkoutReturn).toContain('params.get("live_video") === "success"');
    expect(billingPage).toContain("Payment Processing");
    expect(billingPage).toContain("Runtime Balance Added");
  });

  it("keeps the integration identifier stable across atomic idempotency retries", () => {
    const checkout = read("src/routes/launch-billing-checkout-atomic-routes.ts");
    const helpers = read("src/lib/stripe-helpers.ts");

    expect(checkout).toContain('stripeCheckoutIntegrationIdentifier("plan", operationId)');
    expect(helpers).toContain('createHash("sha256").update(stableSeed)');
  });
});
