import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_sync_concurrency";
  return {
    authoritative: null as Stripe.Subscription | null,
    mirror: {} as Record<string, unknown>,
    settings: {} as Record<string, unknown>,
    writes: [] as string[],
    invoice: vi.fn(),
    webhook: vi.fn(),
    audit: vi.fn(),
  };
});
vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      list: () => {
        const data = h.authoritative ? [h.authoritative] : [];
        return Object.assign(Promise.resolve({ data }), {
          async *[Symbol.asyncIterator]() {
            yield* data;
          },
        });
      },
      update: vi.fn(),
    };
    invoices = { retrieve: h.invoice };
  },
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ ...h.mirror }] }) }),
    }),
    insert: (table: unknown) => ({
      values: () => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (table === schema.subscriptions) {
            h.mirror = { ...h.mirror, ...set };
            h.writes.push(String(set.status));
          } else if (table === schema.settings) h.settings = { ...set };
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
  grantSubscriptionRuntimeAllowance: vi.fn(),
}));
vi.mock("../src/lib/paid-allowance-period", () => ({
  verifiedPaidAllowanceReceipt: () => null,
  recordPaidAllowanceReceipt: vi.fn(),
}));
vi.mock("../src/lib/stripe-capacity-upgrade", () => ({
  paidCapacityPlan: async (_subscription: unknown, plan: unknown) => plan,
}));
vi.mock("../src/lib/workspace-usage-snapshot", () => ({ ensureDefaultAiSpendBudget: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({
  enqueuePaidBotIdentityReconciliation: async () => ({ queued: true }),
}));

import * as schema from "../src/db/schema";
import { syncSubscriptionFromStripe } from "../src/lib/stripe-helpers";
import { resetDistributedLeasesForTests } from "../src/lib/distributed-lease";

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
            recurring: { interval: "month" },
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
  h.mirror = {
    userId: "tenant-owned",
    stripeSubscriptionId: "sub_owned",
    status: "active",
    cancelAtPeriodEnd: false,
    plan: "voice",
  };
  h.settings = { subscriptionStatus: "active" };
  h.authoritative = subscription("active");
  h.webhook.mockResolvedValue(undefined);
  h.audit.mockResolvedValue(undefined);
  h.invoice.mockResolvedValue({ id: "in_owned" });
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
