import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_sync_concurrency";
  return {
    authoritative: null as Stripe.Subscription | null,
    addon: null as Stripe.Subscription | null,
    mirror: {} as Record<string, unknown>,
    settings: {} as Record<string, unknown>,
    writes: [] as string[],
    invoice: vi.fn(),
    webhook: vi.fn(),
    audit: vi.fn(),
    recordReceipt: vi.fn(),
    grantAllowance: vi.fn(),
    reconcileIdentity: vi.fn(),
    spendBudget: vi.fn(),
    updateSubscription: vi.fn(),
    missingBinding: false,
  };
});
vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      list: () => {
        const data = [...(h.authoritative ? [h.authoritative] : []), ...(h.addon ? [h.addon] : [])];
        return Object.assign(Promise.resolve({ data }), {
          async *[Symbol.asyncIterator]() {
            yield* data;
          },
        });
      },
      update: h.updateSubscription,
    };
    invoices = { retrieve: h.invoice };
  },
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (h.missingBinding) {
              h.missingBinding = false;
              return [];
            }
            return [{ ...h.mirror }];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: () => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (table === schema.subscriptions) {
            h.mirror = { ...h.mirror, ...set };
            if (set.status) h.writes.push(String(set.status));
          } else if (table === schema.settings) h.settings = { ...h.settings, ...set };
        },
      }),
    }),
  },
  tenantStore: { run: (_userId: string, run: () => unknown) => run() },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLogger: { logBilling: h.audit },
}));
vi.mock("../src/lib/preview-spend-policy", () => ({ liveStripeCredentialBlocked: () => false }));
vi.mock("../src/lib/stripe-owner-liveness", () => ({ stripeOwnerUserExists: async () => true }));
vi.mock("../src/lib/webhook-helpers", () => ({ dispatchWebhook: h.webhook }));
vi.mock("../src/lib/dashboard-cache", () => ({ invalidateDashboard: vi.fn() }));
vi.mock("../src/lib/subscription-welcome-credit", () => ({
  grantSubscriptionRuntimeAllowance: h.grantAllowance,
}));
vi.mock("../src/lib/paid-allowance-period", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/paid-allowance-period")>()),
  recordPaidAllowanceReceipt: h.recordReceipt,
}));
vi.mock("../src/lib/stripe-capacity-upgrade", () => ({
  paidCapacityPlan: async (_subscription: unknown, plan: unknown) => plan,
}));
vi.mock("../src/lib/workspace-usage-snapshot", () => ({
  ensureDefaultAiSpendBudget: h.spendBudget,
}));
vi.mock("../src/lib/paid-bot-identity", () => ({
  enqueuePaidBotIdentityReconciliation: h.reconcileIdentity,
}));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: () => true }));
vi.mock("../src/lib/founder-fleet-seed", () => ({
  FOUNDER_FLEET_SEED_CONTRACT_VERSION: 1,
  founderFleetSeedNeedsRefresh: () => false,
  seedFounderAssistant: vi.fn(),
}));
vi.mock("../src/lib/founder-showcase-seed", () => ({ ensureFounderShowcaseBots: vi.fn() }));

import * as schema from "../src/db/schema";
import { syncSubscriptionFromStripe } from "../src/lib/stripe-helpers";
import { resetDistributedLeasesForTests } from "../src/lib/distributed-lease";
import { ensureFounderEnterpriseSubscription } from "../src/lib/founder-bootstrap";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function subscription(status: "active" | "canceled"): Stripe.Subscription {
  return {
    id: "sub_owned",
    customer: "cus_owned",
    status,
    cancel_at_period_end: false,
    cancel_at: null,
    created: 1790559098,
    billing_cycle_anchor: 1790559098,
    latest_invoice: "in_owned",
    metadata: { wireline_user_id: "tenant-owned" },
    items: {
      data: [
        {
          current_period_start: 1790559098,
          current_period_end: 1793151098,
          quantity: 1,
          price: {
            id: "price_owned",
            metadata: { wireline_plan_id: "voice" },
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  resetDistributedLeasesForTests();
  h.writes = [];
  h.missingBinding = false;
  h.mirror = {
    userId: "tenant-owned",
    stripeSubscriptionId: "sub_owned",
    status: "active",
    cancelAtPeriodEnd: false,
    plan: "voice",
  };
  h.settings = { subscriptionStatus: "active" };
  h.authoritative = subscription("active");
  h.addon = null;
  h.webhook.mockResolvedValue(undefined);
  h.audit.mockResolvedValue(undefined);
  h.invoice.mockResolvedValue({ id: "in_owned" });
  h.recordReceipt.mockResolvedValue(undefined);
  h.grantAllowance.mockResolvedValue(undefined);
  h.reconcileIdentity.mockResolvedValue({ queued: true });
  h.spendBudget.mockResolvedValue(undefined);
});

describe("explicit founder grant during Stripe reconciliation", () => {
  function grant() {
    h.mirror = {
      ...h.mirror,
      stripeSubscriptionId: null,
      plan: "enterprise",
      status: "active",
      entitlementSource: "demo",
      grantReason: "founder_dogfood",
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    };
    h.settings = { subscriptionStatus: "active", maxAgents: 100, extraAgents: 0 };
    h.addon = {
      ...subscription("active"),
      id: "sub_live_video",
      metadata: { purpose: "live_video_addon" },
    };
  }

  function expectNoEntitlementSideEffects() {
    expect(h.writes).toEqual([]);
    expect(h.updateSubscription).not.toHaveBeenCalled();
    expect(h.grantAllowance).not.toHaveBeenCalled();
    expect(h.reconcileIdentity).not.toHaveBeenCalled();
    expect(h.spendBudget).not.toHaveBeenCalled();
    expect(h.webhook).not.toHaveBeenCalled();
  }

  it.each([
    ["renewal", "active", false],
    ["scheduled cancellation", "active", true],
    ["terminal cancellation", "canceled", false],
  ] as const)(
    "preserves access and limits after a legacy %s and its replay",
    async (_, status, cancel) => {
      grant();
      const before = { ...h.mirror };
      const settingsBefore = { ...h.settings };
      h.authoritative = { ...subscription(status), cancel_at_period_end: cancel };

      await syncSubscriptionFromStripe(h.authoritative);
      await syncSubscriptionFromStripe(h.authoritative);

      expect(h.mirror).toEqual(before);
      expect(h.settings).toEqual(settingsBefore);
      expectNoEntitlementSideEffects();
    },
  );

  it("retains verified paid invoice history without converting the founder grant", async () => {
    grant();
    const sub = h.authoritative!;
    const item = sub.items.data[0];
    h.invoice.mockResolvedValue({
      id: "in_owned",
      customer: "cus_owned",
      status: "paid",
      amount_remaining: 0,
      parent: { subscription_details: { subscription: sub.id } },
      lines: {
        has_more: false,
        data: [
          {
            amount: 1900,
            pricing: { price_details: { price: item.price.id } },
            period: { start: item.current_period_start, end: item.current_period_end },
          },
        ],
      },
    });

    // invoice.payment_succeeded routes the freshly retrieved subscription here.
    await syncSubscriptionFromStripe(sub);

    expect(h.recordReceipt).toHaveBeenCalledWith(
      "tenant-owned",
      expect.objectContaining({
        subscription_id: "sub_owned",
        customer_id: "cus_owned",
        invoice_id: "in_owned",
        plan_id: "voice",
      }),
    );
    expectNoEntitlementSideEffects();
    expect(h.mirror.plan).toBe("enterprise");
  });

  it("preserves grant provenance when repairing a missing customer binding", async () => {
    grant();
    h.missingBinding = true;
    await syncSubscriptionFromStripe(h.authoritative!);
    expect(h.mirror.stripeCustomerId).toBe("cus_owned");
    expect(h.mirror.plan).toBe("enterprise");
    expect(h.mirror.grantReason).toBe("founder_dogfood");
    expectNoEntitlementSideEffects();
  });

  it.each(["expired founder", "ordinary paid"])(
    "preserves a grant refreshed during a provider wait from an %s snapshot",
    async (prior) => {
      if (prior === "expired founder") {
        grant();
        h.mirror.currentPeriodEnd = new Date(0);
      }
      const entered = deferred();
      const proceed = deferred();
      h.invoice.mockImplementationOnce(async () => {
        entered.resolve();
        await proceed.promise;
        return { id: "in_owned" };
      });
      const syncing = syncSubscriptionFromStripe(h.authoritative!);
      await entered.promise;
      let refreshed!: Record<string, unknown>;
      let refreshedSettings!: Record<string, unknown>;
      try {
        await ensureFounderEnterpriseSubscription("tenant-owned");
        refreshed = { ...h.mirror };
        refreshedSettings = { ...h.settings };
        h.writes = [];
      } finally {
        proceed.resolve();
        await syncing;
      }
      expect(h.mirror).toEqual(refreshed);
      expect(h.settings).toEqual(refreshedSettings);
      expect(h.mirror).toMatchObject({ plan: "enterprise", grantReason: "founder_dogfood" });
      expectNoEntitlementSideEffects();
    },
  );

  it("serializes founder refresh against Stripe's mutation phase and permits retry", async () => {
    const entered = deferred();
    const proceed = deferred();
    h.spendBudget.mockImplementationOnce(async () => {
      entered.resolve();
      await proceed.promise;
    });
    const syncing = syncSubscriptionFromStripe(h.authoritative!);
    await entered.promise;
    try {
      await expect(ensureFounderEnterpriseSubscription("tenant-owned")).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(h.mirror.plan).toBe("voice");
    } finally {
      proceed.resolve();
      await syncing;
    }
    await ensureFounderEnterpriseSubscription("tenant-owned");
    expect(h.mirror).toMatchObject({
      plan: "enterprise",
      status: "active",
      grantReason: "founder_dogfood",
    });
    expect(h.settings.subscriptionStatus).toBe("active");
  });

  it.each([
    ["expired", { currentPeriodEnd: new Date(0) }],
    ["unbounded", { currentPeriodEnd: null }],
    ["inactive", { status: "canceled" }],
    ["ordinary demo", { grantReason: "demo_account" }],
    ["ordinary manual", { entitlementSource: "manual", grantReason: "support_grant" }],
    ["Stripe-owned", { entitlementSource: "stripe" }],
  ])("allows normal checkout/subscription sync for an %s grant", async (_, override) => {
    grant();
    h.mirror = { ...h.mirror, ...(override as Record<string, unknown>) };
    await syncSubscriptionFromStripe(h.authoritative!);
    expect(h.mirror).toMatchObject({
      plan: "voice",
      status: "active",
      stripeSubscriptionId: "sub_owned",
    });
    expect(h.writes).toEqual(["active"]);
    expect(h.grantAllowance).toHaveBeenCalledOnce();
    expect(h.reconcileIdentity).toHaveBeenCalledOnce();
    expect(h.webhook).toHaveBeenCalledOnce();
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Stripe subscription synchronization concurrency", () => {
  it("makes an overlapping cancellation retry after the older snapshot completes", async () => {
    let invoiceStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      invoiceStarted = resolve;
    });
    let resumeInvoice!: () => void;
    const paused = new Promise<void>((resolve) => {
      resumeInvoice = resolve;
    });
    h.invoice.mockImplementationOnce(async () => {
      invoiceStarted();
      await paused;
      return { id: "in_owned" };
    });

    const older = syncSubscriptionFromStripe(subscription("active"));
    await started;
    try {
      h.authoritative = subscription("canceled");
      await expect(syncSubscriptionFromStripe(h.authoritative)).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(h.writes).toEqual([]);
    } finally {
      resumeInvoice();
      await older;
    }

    await syncSubscriptionFromStripe(h.authoritative!);
    expect(h.writes).toEqual(["active", "canceled"]);
    expect(h.mirror.status).toBe("canceled");
    expect(h.settings.subscriptionStatus).toBe("canceled");
  });

  it("releases a failed provider read so the normal retry can project current state", async () => {
    h.invoice.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(syncSubscriptionFromStripe(h.authoritative!)).rejects.toThrow(
      "Provider unavailable",
    );
    expect(h.writes).toEqual([]);
    h.authoritative = subscription("canceled");
    await syncSubscriptionFromStripe(h.authoritative);
    expect(h.writes).toEqual(["canceled"]);
  });

  it("does not project an old response after a provider wait outlives the lease safety horizon", async () => {
    vi.useFakeTimers();
    h.invoice.mockImplementationOnce(async () => {
      // Model a suspended process: the provider await resumes after the Redis
      // lease can have expired, without running this process's heartbeat.
      vi.setSystemTime(Date.now() + 16 * 60_000);
      return { id: "in_owned" };
    });
    await expect(syncSubscriptionFromStripe(h.authoritative!)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(h.writes).toEqual([]);
    expect(h.webhook).not.toHaveBeenCalled();
    h.authoritative = subscription("canceled");
    await syncSubscriptionFromStripe(h.authoritative);
    expect(h.writes).toEqual(["canceled"]);
  });
});
