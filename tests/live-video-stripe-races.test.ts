import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const CATALOG_VERSION = "founder_early_access_2026_07_v6";

function subscription(input: {
  id: string;
  status: Stripe.Subscription.Status;
  userId?: string;
  customerId?: string;
}): Stripe.Subscription {
  return {
    id: input.id,
    status: input.status,
    customer: input.customerId ?? "cus_live_video",
    metadata: {
      purpose: "live_video_addon",
      wireline_user_id: input.userId ?? "11111111-1111-4111-8111-111111111111",
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const moduleId of [
    "../src/lib/server-context",
    "../src/lib/credit-wallet",
    "../src/lib/stripe-helpers",
    "../src/lib/stripe-live-video-addon",
    "../src/middleware/auth",
    "../src/middleware/launch-hard-gate",
  ]) {
    vi.doUnmock(moduleId);
  }
});

async function loadLiveVideoAuthority(input: {
  purchased: Stripe.Subscription;
  listed?: Stripe.Subscription[];
}) {
  const retrieve = vi.fn().mockResolvedValue(input.purchased);
  const list = vi.fn().mockResolvedValue({ data: input.listed ?? [] });
  vi.doMock("../src/lib/stripe-helpers", () => ({
    stripe: { subscriptions: { retrieve, list } },
  }));
  const authority = await import("../src/lib/stripe-live-video-addon");
  return { ...authority, retrieve, list };
}

describe("Live Video Checkout uses current Stripe truth", () => {
  it("does not resurrect an add-on when Checkout arrives after cancellation", async () => {
    const canceled = subscription({ id: "sub_canceled", status: "canceled" });
    const { resolveCurrentLiveVideoCheckoutEntitlement, list } = await loadLiveVideoAuthority({
      purchased: canceled,
    });

    await expect(
      resolveCurrentLiveVideoCheckoutEntitlement({
        subscriptionId: canceled.id,
        userId: canceled.metadata.wireline_user_id,
        checkoutCustomerId: "cus_live_video",
      }),
    ).resolves.toMatchObject({ enabled: false, subscription: canceled });
    expect(list).toHaveBeenCalledWith({ customer: "cus_live_video", status: "all", limit: 100 });
  });

  it("preserves a surviving paid add-on for legacy duplicate subscriptions", async () => {
    const canceled = subscription({ id: "sub_canceled", status: "canceled" });
    const survivor = subscription({ id: "sub_survivor", status: "active" });
    const { resolveCurrentLiveVideoCheckoutEntitlement } = await loadLiveVideoAuthority({
      purchased: canceled,
      listed: [canceled, survivor],
    });

    await expect(
      resolveCurrentLiveVideoCheckoutEntitlement({
        subscriptionId: canceled.id,
        userId: canceled.metadata.wireline_user_id,
        checkoutCustomerId: "cus_live_video",
      }),
    ).resolves.toMatchObject({ enabled: true, subscription: canceled });
  });

  it("rejects a subscription stamped for another tenant", async () => {
    const purchased = subscription({
      id: "sub_foreign",
      status: "active",
      userId: "22222222-2222-4222-8222-222222222222",
    });
    const { resolveCurrentLiveVideoCheckoutEntitlement, list } = await loadLiveVideoAuthority({
      purchased,
    });

    await expect(
      resolveCurrentLiveVideoCheckoutEntitlement({
        subscriptionId: purchased.id,
        userId: "11111111-1111-4111-8111-111111111111",
        checkoutCustomerId: "cus_live_video",
      }),
    ).rejects.toThrow(/does not belong to the Checkout owner/);
    expect(list).not.toHaveBeenCalled();
  });
});

describe("Live Video fulfillment projects the authoritative state", () => {
  it("keeps a canceled late Checkout disabled and closes its operation", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const drizzle = {
      update: vi.fn(() => ({
        set(values: Record<string, unknown>) {
          writes.push(values);
          return {
            where() {
              const result = thenable(undefined);
              result.returning = async () =>
                "liveVideoAddonEnabled" in values
                  ? [{ userId: "11111111-1111-4111-8111-111111111111" }]
                  : [];
              return result;
            },
          };
        },
      })),
    };
    vi.doMock("../src/lib/server-context", () => ({
      drizzle,
      tenantStore: { run: (_userId: string, callback: () => unknown) => callback() },
    }));
    vi.doMock("../src/lib/credit-wallet", () => ({ addCredit: vi.fn() }));
    vi.doMock("../src/lib/stripe-helpers", () => ({
      stripe: { subscriptions: { retrieve: vi.fn() } },
      syncSubscriptionFromStripe: vi.fn(),
    }));
    vi.doMock("../src/lib/stripe-live-video-addon", () => ({
      resolveCurrentLiveVideoCheckoutEntitlement: vi.fn().mockResolvedValue({
        enabled: false,
        subscription: subscription({ id: "sub_canceled", status: "canceled" }),
      }),
    }));
    const { fulfillStripeCheckoutSession } = await import("../src/lib/stripe-checkout-fulfillment");

    const result = await fulfillStripeCheckoutSession({
      id: "cs_late",
      mode: "subscription",
      payment_status: "paid",
      customer: "cus_live_video",
      subscription: "sub_canceled",
      metadata: {
        purpose: "live_video_addon",
        wireline_user_id: "11111111-1111-4111-8111-111111111111",
        wireline_checkout_operation_id: "33333333-3333-4333-8333-333333333333",
      },
    } as unknown as Stripe.Checkout.Session);

    expect(result).toMatchObject({ paymentSettled: true, liveVideoEnabled: false });
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ liveVideoAddonEnabled: false }),
        expect.objectContaining({ videoPresenterProvider: "synthetic" }),
        expect.objectContaining({ status: "completed", failureCode: null }),
      ]),
    );
  });
});

type CheckoutOperation = {
  id: string;
  userId: string;
  planId: string;
  billingInterval: string;
  status: string;
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string | null;
  checkoutUrl: string | null;
};

function thenable(value: unknown): Record<string, unknown> {
  return {
    then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

async function loadLiveVideoCheckoutRoute() {
  let activeOperation: CheckoutOperation | null = null;
  let operationSequence = 0;
  const billingRow = {
    stripeCustomerId: "cus_live_video",
    liveVideoAddonEnabled: false,
    planId: "team",
    stripeStatus: "active",
    subscriptionStatus: "active",
  };

  const drizzle = {
    select: vi.fn((fields: Record<string, unknown>) => {
      const isCheckoutOperation = "checkoutUrl" in fields;
      const builder: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["from", "leftJoin", "where"]) {
        builder[method] = () => builder;
      }
      builder.limit = async () =>
        isCheckoutOperation ? (activeOperation ? [activeOperation] : []) : [billingRow];
      return builder;
    }),
    insert: vi.fn(() => ({
      values(values: Record<string, unknown>) {
        return {
          onConflictDoNothing() {
            return {
              async returning() {
                if (activeOperation && ["creating", "open"].includes(activeOperation.status)) {
                  return [];
                }
                operationSequence += 1;
                activeOperation = {
                  id: `11111111-1111-4111-8111-${String(operationSequence).padStart(12, "0")}`,
                  userId: String(values.userId),
                  planId: String(values.planId),
                  billingInterval: String(values.billingInterval),
                  status: String(values.status),
                  stripeCustomerId: null,
                  stripeCheckoutSessionId: null,
                  checkoutUrl: null,
                };
                return [{ id: activeOperation.id }];
              },
            };
          },
        };
      },
    })),
    update: vi.fn(() => ({
      set(values: Record<string, unknown>) {
        return {
          where() {
            // The route's first update expires only rows whose DB expiry is in
            // the past; this in-memory operation is fresh, so that predicate
            // intentionally matches nothing.
            if (activeOperation && "status" in values && values.status !== "expired") {
              Object.assign(activeOperation, values);
            }
            return thenable(undefined);
          },
        };
      },
    })),
  };

  const checkoutCreate = vi.fn().mockResolvedValue({
    id: "cs_live_video",
    url: "https://checkout.stripe.test/cs_live_video",
    status: "open",
  });
  const checkoutRetrieve = vi.fn().mockResolvedValue({
    id: "cs_live_video",
    url: "https://checkout.stripe.test/cs_live_video",
    status: "open",
  });
  const stripe = {
    prices: {
      retrieve: vi.fn().mockResolvedValue({
        id: "price_live_video",
        active: true,
        metadata: { wireline_catalog_version: CATALOG_VERSION },
      }),
    },
    customers: { create: vi.fn() },
    subscriptions: { list: vi.fn().mockResolvedValue({ data: [] }) },
    checkout: {
      sessions: {
        create: checkoutCreate,
        retrieve: checkoutRetrieve,
      },
    },
  };

  vi.doMock("../src/lib/server-context", () => ({
    drizzle,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tenantStore: { run: (_userId: string, callback: () => unknown) => callback() },
    auditLogger: { logBilling: vi.fn().mockResolvedValue(undefined) },
  }));
  vi.doMock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
  vi.doMock("../src/middleware/launch-hard-gate", () => ({ enforceLaunchHardGate: vi.fn() }));
  vi.doMock("../src/lib/stripe-helpers", async (importOriginal) => {
    const original = await importOriginal<typeof import("../src/lib/stripe-helpers")>();
    return { ...original, stripe, stripeAvailable: () => true };
  });

  vi.stubEnv("APP_URL", "https://trywireline.com");
  vi.stubEnv("STRIPE_LIVE_VIDEO_ADDON_PRICE_ID", "price_live_video");
  vi.stubEnv("WIRELINE_LIVE_VIDEO_DISABLED", "false");

  const { default: router } = await import("../src/routes/billing-routes");
  const layer = (router as unknown as { stack: Array<Record<string, any>> }).stack.find(
    (candidate) => candidate.route?.path === "/billing/live-video-checkout",
  );
  const handler = layer?.route?.stack?.at(-1)?.handle as
    ((req: Record<string, unknown>, res: Record<string, unknown>) => Promise<unknown>) | undefined;
  if (!handler) throw new Error("Live Video checkout handler was not registered");

  return { handler, checkoutCreate, checkoutRetrieve };
}

function responseRecorder() {
  const response: Record<string, any> = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
}

describe("Live Video Checkout operation durability", () => {
  const req = {
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
    },
    ip: "127.0.0.1",
  };

  it("refuses talking-head checkout after retirement", async () => {
    const { handler, checkoutCreate, checkoutRetrieve } = await loadLiveVideoCheckoutRoute();

    const first = responseRecorder();
    await handler(req, first);
    const second = responseRecorder();
    await handler(req, second);

    expect(first.statusCode).toBe(503);
    expect(first.body).toMatchObject({
      code: "LIVE_VIDEO_CATALOG_UNAVAILABLE",
    });
    expect(second.body).toMatchObject({
      code: "LIVE_VIDEO_CATALOG_UNAVAILABLE",
    });
    expect(checkoutCreate).not.toHaveBeenCalled();
    expect(checkoutRetrieve).not.toHaveBeenCalled();
  });

  it("does not open Stripe sessions for simultaneous retired checkout requests", async () => {
    const { handler, checkoutCreate } = await loadLiveVideoCheckoutRoute();
    const first = responseRecorder();
    const second = responseRecorder();

    await Promise.all([handler(req, first), handler(req, second)]);

    expect(first.body.code).toBe("LIVE_VIDEO_CATALOG_UNAVAILABLE");
    expect(second.body.code).toBe("LIVE_VIDEO_CATALOG_UNAVAILABLE");
    expect(checkoutCreate).not.toHaveBeenCalled();
  });
});
