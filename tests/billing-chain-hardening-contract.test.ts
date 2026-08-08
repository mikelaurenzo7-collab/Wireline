import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Money-path hardening from the 2026-08-08 billing-chain audit. Each invariant
 * closes a verified silent-loss or dead-end mode on a path that has never
 * processed a real customer, so a regression would surface as lost revenue or
 * lost entitlements — not as a test failure anywhere else.
 */
describe("stripe sync cannot silently swallow a paying customer", () => {
  const helpers = read("src/lib/stripe-helpers.ts");

  it("repairs a missing customer mapping from subscription metadata", () => {
    // Checkout stamps wireline_user_id on every subscription it creates. A
    // mapping row lost to the customer-recovery upsert (or deletion) must be
    // rebuilt from the event, not warned about and acked — Stripe never
    // redelivers an acked event.
    expect(helpers).toMatch(
      /if \(!existing\?\.userId\) \{[\s\S]{0,900}wireline_user_id[\s\S]{0,900}onConflictDoUpdate/,
    );
    expect(helpers).not.toContain("no subscription row for customer — skipping mirror");
  });

  it("still tolerates genuinely foreign subscriptions without a retry loop", () => {
    // No mapping row AND no metadata = unattributable forever. Throwing would
    // poison webhook delivery health with unresolvable retries.
    expect(helpers).toContain("cannot attribute");
  });
});

describe("checkout operations complete instead of bricking the next purchase", () => {
  const webhook = read("src/routes/billing-routes.ts");
  const checkout = read("src/routes/launch-billing-checkout-atomic-routes.ts");

  it("the webhook closes the durable operation on checkout.session.completed", () => {
    expect(webhook).toMatch(
      /syncSubscriptionFromStripe\(sub\);[\s\S]{0,700}wireline_checkout_operation_id[\s\S]{0,700}status: "completed"/,
    );
  });

  it("the reuse path validates the cached session against Stripe before returning it", () => {
    // A consumed or expired session's URL is dead at Stripe; handing it back
    // stranded returning customers inside the 24h operation TTL.
    expect(checkout).toMatch(
      /checkout\.sessions\.retrieve\(\s*active\.stripeCheckoutSessionId,?\s*\)/,
    );
    expect(checkout).toMatch(/samePlan && remoteStatus === "open"/);
  });

  it("a different plan supersedes the open session instead of 409ing for 24 hours", () => {
    // Expire at Stripe FIRST so the superseded URL can never be paid after
    // the replacement exists.
    expect(checkout).toMatch(/checkout\.sessions\.expire\(active\.stripeCheckoutSessionId\)/);
  });
});

describe("entitlement delivery survives webhook failure", () => {
  const checkout = read("src/routes/launch-billing-checkout-atomic-routes.ts");
  const billingPage = read("src/pages/BillingSettings.tsx");

  it("the success redirect proves its session server-side", () => {
    expect(checkout).toContain('"/api/billing/checkout/verify"');
    // Ownership check must not leak foreign sessions: same 404 shape as a
    // nonexistent id.
    expect(checkout).toMatch(/sessionUserId !== req\.user\.id[\s\S]{0,300}404/);
    // The reconcile shares the webhook's writers so the two stay idempotent.
    expect(checkout).toMatch(
      /\/api\/billing\/checkout\/verify[\s\S]*syncSubscriptionFromStripe\(sub\)/,
    );
  });

  it("the billing page calls verify before reading status", () => {
    expect(billingPage).toContain('"/api/billing/checkout/verify"');
    const verifyIdx = billingPage.indexOf("/api/billing/checkout/verify");
    const statusIdx = billingPage.indexOf('authFetch("/api/billing/status")');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(verifyIdx);
  });
});

describe("checkout accepts only instant-notification payment methods", () => {
  // The webhook credits/syncs only on checkout.session.completed with
  // payment_status "paid" and handles no async_payment_succeeded event, so a
  // delayed-notification method (ACH debit, bank transfer) enabled in the
  // dashboard would complete unpaid and the money that lands later would
  // never grant anything. Every session create pins instant methods until
  // async handling exists.
  const sessionCreators = [
    "src/routes/launch-billing-checkout-atomic-routes.ts",
    "src/routes/conversation-balance-routes.ts",
    "src/routes/billing-routes.ts",
  ];
  for (const file of sessionCreators) {
    it(`${file} pins payment_method_types`, () => {
      const source = read(file);
      const creates = source.match(/checkout\.sessions\.create\(/g) || [];
      const pins = source.match(/payment_method_types: \["card", "link"\]/g) || [];
      expect(creates.length).toBeGreaterThan(0);
      expect(pins.length).toBe(creates.length);
    });
  }
});

describe("the trial gate agrees with the dial layer", () => {
  it("legacy trialing rows are blocked up front, not counted then denied", () => {
    // placeOutboundCall and /api/outbound/bulk deny any status other than
    // "active", so admitting "trialing" here only burned trial quota on dials
    // that could never happen.
    const gate = read("src/lib/trial-gate.ts");
    const enforcer = gate.slice(gate.indexOf("export async function enforceTrialOutboundCap"));
    expect(enforcer).not.toContain("trialOutboundCount + 1");
    expect(enforcer).toMatch(/"trialing"[\s\S]{0,700}SUBSCRIPTION_REQUIRED/);
  });
});
