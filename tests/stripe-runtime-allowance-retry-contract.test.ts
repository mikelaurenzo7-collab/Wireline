import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  disputeBalanceMovementCents,
  proportionalTopUpCreditUsd,
  runtimeAllowanceMovementUsd,
  subscriptionDisputeAllowancePortion,
} from "../src/lib/stripe-dispute-accounting";
import { basePlanFromStripeSubscription } from "../src/lib/stripe-base-plan";
import { EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID, STRIPE_PLANS } from "../src/lib/plan-catalog";

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

  /*
   * The aligner derived the endpoint's event list from source; the launch-status
   * gate carried its own hardcoded eight and never learned about the two
   * dispute-funds events implemented in this middleware. A correctly configured
   * endpoint was therefore reported as carrying two "extra" events, and the
   * obvious way to clear `stripe_webhook_not_aligned` would have been to delete
   * them from Stripe — silently stopping the handlers below from ever firing and
   * leaving tenant allowance un-debited when dispute funds move. Both callers
   * now read one helper.
   */
  it("derives the webhook event list from the handlers, in one place", async () => {
    const launchStatus = read("scripts/generate-launch-status.mjs");
    const { getHandledStripeWebhookEvents } =
      await import("../scripts/lib/stripe-handled-events.mjs");

    // A third copy survived the first consolidation: check-vendor-readiness
    // still hardcoded the original eight, so `npm run vendor:readiness` and
    // `npm run stripe:webhook:check` were mutually unsatisfiable — no endpoint
    // configuration passed both. Every consumer reads the helper.
    const vendorReadiness = read("scripts/check-vendor-readiness.mjs");

    for (const [name, source] of [
      ["align", alignment],
      ["launch-status", launchStatus],
      ["vendor-readiness", vendorReadiness],
    ] as const) {
      expect(source, name).toContain("getHandledStripeWebhookEvents()");
      // None may reintroduce a hand-maintained copy.
      expect(source, name).not.toMatch(/=\s*\[\s*\n\s*"charge\.dispute\.created",/);
    }
    expect(launchStatus).not.toMatch(/expectedWebhookEvents = \[/);
    expect(alignment).not.toContain("function extractHandledEvents");

    const events = getHandledStripeWebhookEvents() as string[];
    for (const event of [
      "charge.dispute.created",
      "charge.dispute.funds_withdrawn",
      "charge.dispute.funds_reinstated",
      "checkout.session.completed",
      "invoice.payment_succeeded",
    ]) {
      expect(events, event).toContain(event);
    }
    // The money-movement arms this middleware implements must be in the list.
    expect(middleware).toContain('eventType === "charge.dispute.funds_withdrawn"');
    expect(middleware).toContain('eventType === "charge.dispute.funds_reinstated"');
  });

  it("uses authoritative refund objects and one idempotency key per partial refund", () => {
    expect(middleware).toContain("stripe.refunds.list");
    expect(middleware).toContain("starting_after: startingAfter");
    expect(middleware).toContain("refund.id,");
    expect(middleware).toContain("subscriptionDisputeAllowancePortion(");
    expect(middleware).not.toContain("amount_refunded under charge.id");
  });

  /*
   * Both webhook owners debit Runtime Balance on a refund, and both must key
   * every reversal on the refund's own id. The legacy top-up path documented
   * that rule and then broke it in its own else-branch: when the succeeded-only
   * filter came back empty — the ordinary case for a refund Stripe has accepted
   * but not settled — it reversed cumulative `charge.amount_refunded` keyed on
   * `charge.id`. The later `charge.refunded` redelivery then reversed the same
   * money again per refund.id. Disjoint ref keys defeat the (user, ref) unique
   * index, so nothing dedupes them and the wallet can go negative into a hard
   * 402. Fail closed in both files: throw, release the claim, let Stripe retry.
   */
  it("never reverses a refund under the charge id, in either webhook owner", () => {
    const billing = read("src/routes/billing-routes.ts");

    for (const [name, source] of [
      ["billing-routes", billing],
      ["allowance-retry", middleware],
    ] as const) {
      expect(source, name).toContain("reports refunded funds but no succeeded refund objects.");
      // The reversal reference must never be the charge.
      expect(source, name).not.toMatch(/\bid:\s*charge\.id,/);
      expect(source, name).not.toMatch(/providerObjectId:\s*charge\.id,/);
    }
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

  it("extracts actual withdrawn and reinstated proportions from balance movements", () => {
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

  it("uses settlement-currency ratios instead of converting incompatible minor units", () => {
    // A 1,000 JPY dispute can settle as a 700-cent USD withdrawal. A later
    // 350-cent reinstatement is half of the withdrawn balance, so restore 500
    // JPY regardless of JPY's zero-decimal and USD's two-decimal exponent.
    const fxTransactions = [
      { amount: -700, currency: "usd" },
      { amount: 350, currency: "usd" },
    ];
    expect(
      disputeBalanceMovementCents({
        disputeAmountCents: 1_000,
        disputeCurrency: "jpy",
        balanceTransactions: fxTransactions,
        direction: "withdrawn",
      }),
    ).toBe(1_000);
    expect(
      disputeBalanceMovementCents({
        disputeAmountCents: 1_000,
        disputeCurrency: "jpy",
        balanceTransactions: fxTransactions,
        direction: "reinstated",
      }),
    ).toBe(500);
    expect(() =>
      disputeBalanceMovementCents({
        disputeAmountCents: 1_000,
        disputeCurrency: "jpy",
        balanceTransactions: [
          { amount: -700, currency: "usd" },
          { amount: 350, currency: "eur" },
        ],
        direction: "reinstated",
      }),
    ).toThrow(/inconsistent settlement currencies/);
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
    expect(proportionalTopUpCreditUsd(Number.NaN, 10_000, 10)).toBe(0);
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
    expect(middleware).toContain(
      "reinstatement arrived before its subscription allowance withdrawal",
    );
    expect(middleware).toContain("reinstatement arrived before its top-up withdrawal");
  });

  it("resolves base plans without mistaking an add-on-first item for the plan", () => {
    const business = STRIPE_PLANS.find((plan) => plan.id === "business");
    expect(business?.fallbackPriceId).toBeTruthy();
    const resolved = basePlanFromStripeSubscription({
      items: {
        data: [
          {
            price: {
              id: EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
              metadata: { wireline_addon_id: "extra_agent" },
            },
          },
          { price: { id: business?.fallbackPriceId } },
        ],
      },
    });
    expect(resolved?.id).toBe("business");
  });

  it("resolves late disputes through stable customer ownership and historical plan truth", () => {
    const subscriptionLookup = middleware.indexOf(
      "schema.subscriptions.stripeSubscriptionId, subscriptionId",
    );
    const customerFallback = middleware.indexOf(
      "schema.subscriptions.stripeCustomerId, customerId",
    );
    expect(subscriptionLookup).toBeGreaterThan(-1);
    expect(customerFallback).toBeGreaterThan(subscriptionLookup);
    expect(middleware).toContain("basePlanFromStripeSubscription(subscription)");
    expect(middleware).toContain("planId: disputedPlan.id");
    expect(middleware).not.toContain("planId: row.plan");
    expect(middleware).toContain("historical plan is not mapped");
  });

  it("fails closed when a subscription-funded charge has no resolvable Wireline owner", () => {
    expect(middleware).toContain("funded Runtime Allowance but its Wireline owner is unresolved");
  });

  // The invariant is unchanged — both owners must be parsed, so an event
  // implemented at the stricter preflight boundary is never omitted from the
  // endpoint subscription. The parsing itself moved into the shared helper the
  // launch-status gate now reads too, so this asserts against that owner.
  it("keeps endpoint subscriptions aligned with the preflight event owner", async () => {
    const helper = read("scripts/lib/stripe-handled-events.mjs");
    const { STRIPE_WEBHOOK_EVENT_OWNERS } =
      await import("../scripts/lib/stripe-handled-events.mjs");

    expect(alignment).toContain("getHandledStripeWebhookEvents()");
    expect(helper).toContain("function extractHandledEvents");
    expect(STRIPE_WEBHOOK_EVENT_OWNERS).toContain(
      "src/middleware/stripe-runtime-allowance-retry.ts",
    );
    expect(STRIPE_WEBHOOK_EVENT_OWNERS).toContain("src/routes/billing-routes.ts");
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
