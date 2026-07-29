import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-8 billing integrity", () => {
  const billing = read("src/routes/billing-routes.ts");
  const extraAgentBilling = read("src/routes/extra-agent-billing-atomic-routes.ts");

  it("invoices an extra-agent increase instead of granting capacity a cycle early", () => {
    // A bare quantity change prorates onto the NEXT invoice while
    // includedVoiceMinutes grants the minutes immediately — buy 100, burn the
    // ~5,000 minutes, drop to 0 for a credit, and none of the consumed minutes
    // is ever re-priced.
    expect(extraAgentBilling).toContain(
      "const isIncrease = target > currentStripeQuantity",
    );
    expect(extraAgentBilling).toContain(
      'proration_behavior: isIncrease ? "always_invoice" : "create_prorations"',
    );
    expect(extraAgentBilling).toContain('payment_behavior: "error_if_incomplete"');
  });

  it("fails closed when Stripe could not collect for the increase", () => {
    expect(extraAgentBilling).toContain("PAYMENT_REQUIRED");
    expect(extraAgentBilling).toContain(
      "isIncrease && isStripePaymentRequiredError(error)",
    );
    expect(extraAgentBilling).toContain("return paymentRequiredOutcome()");
    expect(extraAgentBilling.indexOf("stripe.subscriptionItems")).toBeLessThan(
      extraAgentBilling.indexOf("return persistQuantity(target"),
    );
  });

  it("claims a Stripe webhook as processing and only marks processed on success", () => {
    // A killed invocation (maxDuration, OOM, recycle) never runs the JS
    // rollback, so a bare claim made a redelivery indistinguishable from a
    // genuine duplicate and the event was dropped — for a credit top-up that
    // means the customer paid and the balance never moved.
    expect(billing).toContain('status: "processing"');
    expect(billing).toContain('.set({ status: "processed", processedAt: new Date() })');
  });

  it("releases an abandoned claim so Stripe redelivers", () => {
    expect(billing).toContain('prior?.status === "processing"');
    expect(billing).toContain("abandonedAfterMs");
    expect(billing).toContain("Prior delivery did not complete. Retry.");
  });

  it("carries the claim status on the schema and in a migration", () => {
    expect(read("src/db/schema.ts")).toContain(
      'status: text("status").notNull().default("processed")',
    );
    const migration = read("drizzle/migrations/0112_stripe_event_claim_status.sql");
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed'",
    );
  });

  it("rolls the usage counter back when a voice overage charge fails", () => {
    // The overage band is derived from the counter, so leaving it inflated
    // after a failed charge makes those minutes permanently unbillable and
    // leaves the pre-call solvency gate open on spent coverage.
    const usage = read("src/lib/voice-usage.ts");
    expect(usage).toContain("catch (chargeError)");
    expect(usage).toContain("GREATEST(0,");
    expect(usage).toContain("usage counter rolled back for retry");
  });
});

describe("round-8 usage meter truthfulness", () => {
  it("drives the progress fill from value, not a decorative attribute", () => {
    // The indicator was w-full with only a data-progress attribute that no
    // stylesheet reads, so every bar rendered 100% full: "0 / 120 · 0% used"
    // sat beside a completely full Voice minutes meter, and 95% looked the same.
    const progress = read("src/components/ui/shadcn/Progress.tsx");
    expect(progress).toContain("transform: `translateX(-${100 - clampPercent(value)}%)`");
    expect(progress).toContain("function clampPercent");
    // Overage can push usage past 100%; the fill must stop at the track end.
    expect(progress).toContain("Math.min(100, Math.max(0, value as number))");
  });
});

describe("round-9 subscription allowance reversal", () => {
  it("reverses the Runtime Allowance when a subscription charge is refunded or disputed", () => {
    // Top-ups have been protected since round 4, but a subscription invoice
    // PaymentIntent carries no purpose=credit_topup marker, so these charges
    // fell straight through and left the allowance spendable after the money
    // went back — e.g. a refunded annual Business kept $120 of Runtime Balance.
    const billing = read("src/routes/billing-routes.ts");
    expect(billing).toContain("async function reverseRuntimeAllowanceForCharge");
    expect(billing).toContain('reverseRuntimeAllowanceForCharge(charge, "refund")');
    expect(billing).toContain('reverseRuntimeAllowanceForCharge(disputedCharge, "dispute"');
  });

  it("resolves plan and interval from the subscription behind the charge", () => {
    const billing = read("src/routes/billing-routes.ts");
    const fn = billing.slice(
      billing.indexOf("async function reverseRuntimeAllowanceForCharge"),
      billing.indexOf("// ─── Stripe Webhook"),
    );
    expect(fn).toContain("stripe.invoices.retrieve(invoiceId)");
    expect(fn).toContain("schema.subscriptions.stripeSubscriptionId, subscriptionId");
    // Interval is resolved the same way the grant did (any yearly item ⇒
    // yearly), via the shared helper rather than an index-0 read.
    expect(fn).toContain("subscriptionBillingInterval(sub)");
    expect(fn).toContain("tenantStore.run(row.userId");
  });

  it("keys the reversal on the refund/dispute id so redelivery is idempotent", () => {
    const helper = read("src/lib/subscription-welcome-credit.ts");
    expect(helper).toContain("export async function reverseSubscriptionRuntimeAllowance");
    expect(helper).toContain('type: "subscription_runtime_allowance_reversal"');
    expect(helper).toContain("id: reversalReference");
    // Reversal basis is the grant scaled by the refunded portion, so cumulative
    // partial reversals can never exceed the granted allowance.
    expect(helper).toContain("runtimeAllowanceUsdForPlan(planId, interval) * clampedPortion");
  });
});
