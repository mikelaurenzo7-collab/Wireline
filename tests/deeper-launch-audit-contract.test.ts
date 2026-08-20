import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("deeper launch audit hardening", () => {
  it("keeps static Vercel CSP aligned with browser voice transport and gates every deploy", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const deploy = read("scripts/vercel-deploy.mjs");
    const csp = vercel.headers
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("https://*.daily.co");
    expect(csp).toContain("wss://*.daily.co");
    expect(deploy).toContain('run(process.execPath, ["scripts/check-csp-drift.mjs"]);');
  });

  it("terminalizes provider-expired Checkout operations before the broad billing router", async () => {
    const preflight = read("src/middleware/stripe-checkout-expiration-preflight.ts");
    const registry = read("src/server/register-api-routes.ts");
    const handled = read("scripts/lib/stripe-handled-events.mjs");
    const { getHandledStripeWebhookEvents } =
      await import("../scripts/lib/stripe-handled-events.mjs");

    expect(preflight).toContain('event.type !== "checkout.session.expired"');
    expect(preflight).toContain("stripe.webhooks.constructEvent");
    expect(preflight).toContain("wireline_checkout_operation_id");
    expect(preflight).toContain("wireline_user_id");
    expect(preflight).toContain("checkoutOperations.stripeCheckoutSessionId, session.id");
    expect(preflight).toContain('status: "expired"');
    expect(preflight).toContain('failureCode: "stripe_checkout_session_expired"');
    expect(preflight).toContain('status: "processed"');

    const mount = registry.indexOf(
      'app.use("/api/stripe-webhook", stripeCheckoutExpirationPreflight)',
    );
    const billing = registry.indexOf('app.use("/api", billingRouter)');
    expect(mount).toBeGreaterThan(-1);
    expect(billing).toBeGreaterThan(mount);
    expect(handled).toContain("stripe-checkout-expiration-preflight.ts");
    expect(getHandledStripeWebhookEvents()).toContain("checkout.session.expired");
  });

  it("promotes the reconciled active-subscription provenance guard to a validated invariant", () => {
    const migration = read(
      "drizzle/migrations/0156_validate_active_subscription_provenance.sql",
    );
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const last = journal.entries.at(-1);

    expect(migration).toContain(
      'VALIDATE CONSTRAINT "wireline_subscriptions_active_provenance_check"',
    );
    expect(last?.tag).toBe("0156_validate_active_subscription_provenance");
    expect(last?.idx).toBe(54);
  });
});
