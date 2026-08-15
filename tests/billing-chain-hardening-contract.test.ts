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
  const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");

  it("the webhook closes the durable operation on checkout.session.completed", () => {
    expect(webhook).toContain("await fulfillStripeCheckoutSession(session");
    expect(fulfillment).toMatch(
      /syncSubscriptionFromStripe\(subscription\);[\s\S]{0,500}markCheckoutOperationCompleted\(session\)/,
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
  const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");

  it("the success redirect proves its session server-side", () => {
    expect(checkout).toContain('"/api/billing/checkout/verify"');
    // Ownership check must not leak foreign sessions: same 404 shape as a
    // nonexistent id.
    expect(checkout).toMatch(/sessionUserId !== req\.user\.id[\s\S]{0,300}404/);
    // The reconcile shares the webhook's writers so the two stay idempotent.
    expect(checkout).toMatch(/\/api\/billing\/checkout\/verify[\s\S]*fulfillStripeCheckoutSession/);
    expect(fulfillment).toContain("await syncSubscriptionFromStripe(subscription)");
  });

  it("the billing page calls verify before reading status", () => {
    expect(billingPage).toContain('"/api/billing/checkout/verify"');
    const verifyIdx = billingPage.indexOf("/api/billing/checkout/verify");
    const statusIdx = billingPage.indexOf('authFetch("/api/billing/status")');
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(verifyIdx);
  });
});

describe("checkout safely supports Dashboard-managed payment methods", () => {
  const sessionCreators = [
    "src/routes/launch-billing-checkout-routes.ts",
    "src/routes/launch-billing-checkout-atomic-routes.ts",
    "src/routes/conversation-balance-routes.ts",
    "src/routes/billing-routes.ts",
  ];
  for (const file of sessionCreators) {
    it(`${file} leaves payment methods dynamic and tags the flow`, () => {
      const source = read(file);
      const creates = source.match(/checkout\.sessions\.create\(/g) || [];
      const identifiers = source.match(/integration_identifier:/g) || [];
      expect(creates.length).toBeGreaterThan(0);
      expect(identifiers.length).toBe(creates.length);
      expect(source).not.toContain("payment_method_types:");
    });
  }

  it("handles delayed success and releases a failed durable plan checkout", () => {
    const webhook = read("src/routes/billing-routes.ts");
    const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");

    expect(webhook).toContain("await fulfillStripeCheckoutSession(session");
    expect(webhook).toContain('case "checkout.session.async_payment_succeeded"');
    expect(webhook).toContain('case "checkout.session.async_payment_failed"');
    expect(webhook).toContain("await failStripeCheckoutSession(");
    expect(fulfillment).toContain("id: session.id,");
    expect(fulfillment).toContain("if (!paymentSettled) return result;");
    expect(fulfillment).toContain('failureCode: "stripe_async_payment_failed"');
    expect(fulfillment).toContain("eq(checkoutOperations.userId, userId)");
    expect(fulfillment).toContain('inArray(checkoutOperations.status, ["creating", "open"])');
  });
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

/*
 * The live-video add-on is a standalone Stripe subscription sharing the plan's
 * customer, and its only local record is a workspace-wide boolean written
 * solely by the webhook. That made the flag wrong for both questions it was
 * being asked. On checkout it was a stale duplicate guard: during webhook
 * delivery lag it still read false after a completed purchase, so a second
 * click created a second subscription that nothing ever detected or cancelled.
 * On cancellation it was worse — clearing it keyed on the customer, not the
 * subscription, so ending one of two turned the feature off and reset EVERY
 * agent to synthetic while the survivor kept billing monthly. Ask Stripe.
 */
describe("the live-video add-on asks Stripe what the customer actually has", () => {
  const source = read("src/routes/billing-routes.ts");
  const authority = read("src/lib/stripe-live-video-addon.ts");

  it("checks for an existing add-on subscription before creating a session", () => {
    const check = source.indexOf("const existingAddons = await listCurrentLiveVideoAddons(");
    const create = source.indexOf("stripe.checkout.sessions.create(", check);
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
  });

  it("re-checks for a surviving subscription before resetting every agent", () => {
    const survivorCheck = source.indexOf("listCurrentLiveVideoAddons(customerId, sub.id)");
    const reset = source.indexOf('videoPresenterProvider: "synthetic"');
    expect(survivorCheck).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(survivorCheck);
    // A survivor keeps the entitlement; a failed lookup must still disable.
    expect(source).toContain("disable = false;");
    expect(source).toContain("Live video add-on survivor check failed; disabling");
  });

  it("excludes terminal subscriptions from both answers", () => {
    expect(authority).toContain("LIVE_VIDEO_ADDON_NON_ENTITLING_STATUSES");
    expect(authority).toContain('subscription.metadata?.purpose === "live_video_addon"');
  });

  it("deduplicates an open Live Video Checkout before Stripe creates a subscription", () => {
    const operation = source.indexOf("insertLiveVideoCheckoutOperation(req.user.id)");
    const create = source.indexOf("stripe.checkout.sessions.create(", operation);
    expect(operation).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(operation);
    expect(source).toContain("wireline-live-video-checkout-${operationId}");
    expect(source).toContain("wireline_checkout_operation_id: operationId");
    expect(source).toContain('remoteSession?.status === "open"');
  });
});
