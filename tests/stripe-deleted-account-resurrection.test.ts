import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  for (const moduleId of [
    "../src/lib/server-context",
    "../src/lib/credit-wallet",
    "../src/lib/runtime-balance-operation",
    "../src/lib/stripe-helpers",
    "../src/lib/stripe-live-video-addon",
    "../src/lib/stripe-owner-liveness",
  ]) {
    vi.doUnmock(moduleId);
  }
});

async function loadFulfillmentWithDeletedOwner() {
  const addCredit = vi.fn();
  const retrieveSubscription = vi.fn();
  const syncSubscriptionFromStripe = vi.fn();
  const resolveLiveVideo = vi.fn();
  const transitionRuntimeBalanceOperation = vi.fn();
  const tenantRun = vi.fn((_userId: string, callback: () => unknown) => callback());
  const logInfo = vi.fn();
  const stripeOwnerUserExists = vi.fn().mockResolvedValue(false);

  vi.doMock("../src/lib/server-context", () => ({
    drizzle: {},
    log: { info: logInfo },
    tenantStore: { run: tenantRun },
  }));
  vi.doMock("../src/lib/credit-wallet", () => ({ addCredit }));
  vi.doMock("../src/lib/runtime-balance-operation", () => ({
    transitionRuntimeBalanceOperation,
  }));
  vi.doMock("../src/lib/stripe-helpers", () => ({
    stripe: { subscriptions: { retrieve: retrieveSubscription } },
    syncSubscriptionFromStripe,
  }));
  vi.doMock("../src/lib/stripe-live-video-addon", () => ({
    resolveCurrentLiveVideoCheckoutEntitlement: resolveLiveVideo,
  }));
  vi.doMock("../src/lib/stripe-owner-liveness", () => ({ stripeOwnerUserExists }));

  const { fulfillStripeCheckoutSession } = await import("../src/lib/stripe-checkout-fulfillment");
  return {
    addCredit,
    fulfillStripeCheckoutSession,
    logInfo,
    resolveLiveVideo,
    retrieveSubscription,
    stripeOwnerUserExists,
    syncSubscriptionFromStripe,
    tenantRun,
    transitionRuntimeBalanceOperation,
  };
}

describe("late Checkout fulfillment after account erasure", () => {
  it("acknowledges a settled plan Checkout without rebuilding entitlements", async () => {
    const harness = await loadFulfillmentWithDeletedOwner();
    const result = await harness.fulfillStripeCheckoutSession({
      id: "cs_late_plan",
      mode: "subscription",
      payment_status: "paid",
      subscription: "sub_late",
      metadata: { wireline_user_id: "11111111-1111-4111-8111-111111111111" },
    } as unknown as Stripe.Checkout.Session);

    expect(result).toEqual({
      paymentSettled: true,
      subscriptionSynced: false,
      creditGranted: false,
      liveVideoEnabled: false,
    });
    expect(harness.stripeOwnerUserExists).toHaveBeenCalledOnce();
    expect(harness.retrieveSubscription).not.toHaveBeenCalled();
    expect(harness.syncSubscriptionFromStripe).not.toHaveBeenCalled();
    expect(harness.resolveLiveVideo).not.toHaveBeenCalled();
    expect(harness.tenantRun).not.toHaveBeenCalled();
    expect(harness.logInfo).toHaveBeenCalledWith(
      expect.stringContaining("deleted account"),
      expect.objectContaining({ checkoutSessionId: "cs_late_plan" }),
    );
  });

  it("acknowledges a settled top-up without recreating wallet credit", async () => {
    const harness = await loadFulfillmentWithDeletedOwner();
    const result = await harness.fulfillStripeCheckoutSession({
      id: "cs_late_topup",
      mode: "payment",
      payment_status: "paid",
      metadata: {
        purpose: "credit_topup",
        wireline_user_id: "11111111-1111-4111-8111-111111111111",
        credit_usd: "25",
      },
    } as unknown as Stripe.Checkout.Session);

    expect(result).toEqual({
      paymentSettled: true,
      subscriptionSynced: false,
      creditGranted: false,
      liveVideoEnabled: false,
    });
    expect(harness.stripeOwnerUserExists).toHaveBeenCalledOnce();
    expect(harness.addCredit).not.toHaveBeenCalled();
    expect(harness.transitionRuntimeBalanceOperation).not.toHaveBeenCalled();
    expect(harness.tenantRun).not.toHaveBeenCalled();
  });
});
