import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/stripe-helpers.ts", "utf8").replace(/\r\n/g, "\n");

describe("authoritative Stripe subscription reconciliation", () => {
  it("reconciles configured webhook syncs from the customer's current Stripe state", () => {
    const helper = source.slice(
      source.indexOf("async function currentPlanSubscriptionForCustomer"),
      source.indexOf("async function mirrorPointsAtNewerSubscription"),
    );
    expect(helper).toContain("stripe.subscriptions.list({");
    expect(helper).toContain('status: "all"');
    expect(helper).toContain("isWirelinePlanSubscription(candidate)");
    expect(helper).toContain("CURRENT_PLAN_SUBSCRIPTION_STATUSES");
    expect(helper).toContain("current.length > 1");
  });

  it("does not let a stale event payload outrank the authoritative subscription", () => {
    const sync = source.slice(source.indexOf("export async function syncSubscriptionFromStripe"));
    expect(sync).toContain("const authoritative = await currentPlanSubscriptionForCustomer(customerId)");
    expect(sync).toContain("if (authoritative.id !== incomingSub.id)");
    expect(sync).toContain("return;");
    expect(sync).toContain("sub = authoritative;");

    // Reconciliation is unconditional when Stripe is configured, so an old
    // same-id `updated(active)` payload is replaced by its current canceled
    // object too — not only cross-subscription mismatches.
    expect(sync.indexOf("currentPlanSubscriptionForCustomer(customerId)")).toBeLessThan(
      sync.indexOf("const userId = existing.userId"),
    );
  });

  it("keeps timestamp ordering out of the configured production path", () => {
    const sync = source.slice(source.indexOf("export async function syncSubscriptionFromStripe"));
    const configured = sync.slice(
      sync.indexOf("if (stripeAvailable())"),
      sync.indexOf("} else {", sync.indexOf("if (stripeAvailable())")),
    );
    expect(configured).not.toContain(".created >");
    expect(configured).not.toContain("mirrorPointsAtNewerSubscription");
  });
});
