import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_cancellation_fixture";
  return {
    authoritative: null as Stripe.Subscription | null,
    addons: [] as Stripe.Subscription[],
    existing: {} as Record<string, unknown>,
    writes: [] as Array<{
      table: unknown;
      values: Record<string, unknown>;
      set: Record<string, unknown>;
    }>,
    update: vi.fn(),
    grant: vi.fn(),
    receipt: vi.fn(),
    verifyReceipt: vi.fn(),
    webhook: vi.fn(),
    audit: vi.fn(),
    budget: vi.fn(),
    openCheckouts: vi.fn(),
    inventoryFailure: false,
  };
});

vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      list: () => {
        const data = [...(h.authoritative ? [h.authoritative] : []), ...h.addons];
        return Object.assign(Promise.resolve({ data }), {
          async *[Symbol.asyncIterator]() {
            yield* data;
            if (h.inventoryFailure) throw new Error("Next subscription page unavailable");
          },
        });
      },
      update: h.update,
    };
    invoices = { retrieve: vi.fn(async () => ({ id: "in_paid" })) };
    checkout = { sessions: { list: h.openCheckouts } };
  },
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [h.existing] }) }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          h.writes.push({ table, values, set });
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
  grantSubscriptionRuntimeAllowance: h.grant,
}));
vi.mock("../src/lib/paid-allowance-period", () => ({
  verifiedPaidAllowanceReceipt: h.verifyReceipt,
  recordPaidAllowanceReceipt: h.receipt,
}));
vi.mock("../src/lib/stripe-capacity-upgrade", () => ({
  paidCapacityPlan: async (_subscription: unknown, plan: unknown) => plan,
}));
vi.mock("../src/lib/workspace-usage-snapshot", () => ({ ensureDefaultAiSpendBudget: h.budget }));
vi.mock("../src/lib/paid-bot-identity", () => ({
  enqueuePaidBotIdentityReconciliation: async () => ({ queued: true }),
}));

import * as schema from "../src/db/schema";
import {
  syncSubscriptionFromStripe,
  stripeAllowsCanceledNumberReclamation,
} from "../src/lib/stripe-helpers";
import { stripeSubscriptionCancellation } from "../src/lib/stripe-subscription-cancellation";

const END = 1793151098;
const START = 1790559098;
const END_ISO = new Date(END * 1000).toISOString();
function subscription(fields: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_pilot",
    customer: "cus_pilot",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: END,
    canceled_at: START + 131,
    created: START,
    billing_cycle_anchor: START,
    latest_invoice: "in_paid",
    metadata: { wireline_user_id: "pilot" },
    items: {
      data: [
        {
          current_period_start: START,
          current_period_end: END,
          quantity: 1,
          price: {
            id: "price_calls",
            metadata: { wireline_plan_id: "voice" },
            recurring: { interval: "month" },
          },
        },
      ],
    },
    ...fields,
  } as unknown as Stripe.Subscription;
}
function addon(fields: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return subscription({
    id: "sub_addon",
    cancel_at: null,
    metadata: { purpose: "live_video_addon", wireline_base_plan_cascade: "true" },
    ...fields,
  });
}
function mirrored() {
  const write = h.writes.find(({ table }) => table === schema.subscriptions);
  expect(write).toBeDefined();
  expect(write!.values).toEqual(expect.objectContaining(write!.set));
  return write!.set;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.writes = [];
  h.addons = [];
  h.authoritative = subscription();
  h.existing = {
    userId: "pilot",
    stripeSubscriptionId: "sub_pilot",
    status: "active",
    cancelAtPeriodEnd: false,
    plan: "voice",
  };
  h.update.mockResolvedValue({});
  h.webhook.mockResolvedValue(undefined);
  h.audit.mockResolvedValue(undefined);
  h.grant.mockResolvedValue(undefined);
  h.budget.mockResolvedValue(undefined);
  h.receipt.mockResolvedValue(undefined);
  h.verifyReceipt.mockReturnValue({ period_start: START, period_end: END });
  h.openCheckouts.mockResolvedValue({ data: [], has_more: false });
  h.inventoryFailure = false;
});

describe("provider evidence before destructive number reclamation", () => {
  const input = {
    customerId: "cus_pilot",
    subscriptionId: "sub_pilot",
    canceledBefore: new Date((END + 1) * 1000),
  };

  it("requires the expected canceled subscription and fully enumerated old terminal inventory", async () => {
    h.authoritative = subscription({ status: "canceled" });
    await expect(stripeAllowsCanceledNumberReclamation(input)).resolves.toBe(true);
    expect(h.openCheckouts).toHaveBeenCalledExactlyOnceWith({
      customer: "cus_pilot",
      status: "open",
      limit: 1,
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each(["active", "trialing", "incomplete", "past_due", "unpaid", "paused", "future_unknown"])(
    "retains a number for an unmapped %s subscription even when the old subscription remains canceled",
    async (status) => {
      h.authoritative = subscription({ status: "canceled" });
      h.addons = [
        subscription({
          id: "sub_unmapped_new",
          status: status as Stripe.Subscription.Status,
          metadata: {},
          items: { data: [] } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>,
        }),
      ];
      await expect(stripeAllowsCanceledNumberReclamation(input)).resolves.toBe(false);
    },
  );

  it.each([
    { data: [{ id: "cs_open" }], has_more: false },
    { data: [], has_more: true },
    { data: null, has_more: false },
  ])("retains a line when open-checkout inventory is payable or inconclusive: %j", async (page) => {
    h.authoritative = subscription({ status: "canceled" });
    h.openCheckouts.mockResolvedValueOnce(page);
    await expect(stripeAllowsCanceledNumberReclamation(input)).resolves.toBe(false);
  });

  it("refuses partial subscription pagination without acknowledging canceled status as complete proof", async () => {
    h.authoritative = subscription({ status: "canceled" });
    h.inventoryFailure = true;
    await expect(stripeAllowsCanceledNumberReclamation(input)).rejects.toThrow(
      "Next subscription page unavailable",
    );
  });

  it.each(["missing", "foreign customer", "within grace", "malformed end"])(
    "retains the line for %s provider evidence",
    async (state) => {
      h.authoritative = state === "missing" ? null : subscription({ status: "canceled" });
      if (state === "foreign customer") h.authoritative!.customer = "cus_foreign";
      if (state === "within grace") input.canceledBefore = new Date(END * 1000);
      if (state === "malformed end") {
        const item = h.authoritative!.items.data[0] as Stripe.SubscriptionItem & {
          current_period_end: number;
        };
        item.current_period_end = NaN;
        h.authoritative!.ended_at = null;
        h.authoritative!.canceled_at = null;
      }
      try {
        await expect(stripeAllowsCanceledNumberReclamation(input)).resolves.toBe(false);
      } finally {
        input.canceledBefore = new Date((END + 1) * 1000);
      }
    },
  );
});

describe("explicit Stripe cancellation reconciliation", () => {
  it("projects the live portal timestamp without ending paid access or changing its paid period", async () => {
    // A stale event still resolves against the current Stripe object.
    await syncSubscriptionFromStripe(subscription({ cancel_at: null }));
    expect(mirrored()).toMatchObject({
      cancelAtPeriodEnd: true,
      status: "active",
      plan: "voice",
      currentPeriodEnd: new Date(END_ISO),
    });
    expect(h.writes.find(({ table }) => table === schema.settings)?.set.subscriptionStatus).toBe(
      "active",
    );
    expect(h.receipt).toHaveBeenCalledWith("pilot", { period_start: START, period_end: END });
    expect(h.verifyReceipt.mock.calls[0][0]).toBe(h.authoritative);
    expect(h.grant).toHaveBeenCalledWith("pilot", `sub_pilot:${START}`, "voice", "month");
    expect(h.webhook).toHaveBeenCalledWith(
      "pilot",
      "subscription.changed",
      expect.objectContaining({
        cancel_at_period_end: true,
        current_period_end: END_ISO,
        status: "active",
      }),
    );
    expect(h.audit).toHaveBeenCalledWith(
      "subscription_updated",
      expect.objectContaining({
        metadata: expect.objectContaining({ cancel_at_period_end: true }),
      }),
    );
    expect(h.update).not.toHaveBeenCalled();
  });

  it("keeps an existing cancellation cascade while the base has an explicit end date", async () => {
    h.existing.cancelAtPeriodEnd = true;
    h.addons = [addon({ cancel_at_period_end: true })];
    await syncSubscriptionFromStripe(subscription());
    expect(mirrored().cancelAtPeriodEnd).toBe(true);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("schedules a renewing dependent add-on when the base uses an explicit end date", async () => {
    h.addons = [addon({ metadata: { purpose: "live_video_addon" } })];
    await syncSubscriptionFromStripe(subscription());
    expect(h.update).toHaveBeenCalledExactlyOnceWith("sub_addon", {
      cancel_at_period_end: true,
      metadata: { wireline_base_plan_cascade: "true" },
    });
  });

  it("clears the local cancellation and restores only a managed cascade after Stripe resumes renewal", async () => {
    h.existing.cancelAtPeriodEnd = true;
    h.authoritative = subscription({ cancel_at: null });
    h.addons = [
      addon({ cancel_at_period_end: true }),
      addon({
        id: "sub_manual",
        cancel_at_period_end: true,
        metadata: { purpose: "live_video_addon" },
      }),
    ];
    await syncSubscriptionFromStripe(subscription());
    expect(mirrored()).toMatchObject({
      cancelAtPeriodEnd: false,
      status: "active",
      currentPeriodEnd: new Date(END_ISO),
    });
    expect(h.update).toHaveBeenCalledExactlyOnceWith("sub_addon", {
      cancel_at_period_end: false,
      metadata: { wireline_base_plan_cascade: "" },
    });
  });

  it.each([END - 86400, END + 86400])(
    "preserves a non-period cancellation date %s without false restoration or period rewrites",
    async (cancelAt) => {
      h.existing.cancelAtPeriodEnd = true;
      h.authoritative = subscription({ cancel_at: cancelAt });
      h.addons = [addon({ cancel_at_period_end: true })];
      await syncSubscriptionFromStripe(subscription());
      expect(mirrored()).toMatchObject({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(END_ISO),
        status: "active",
      });
      expect(stripeSubscriptionCancellation(h.authoritative, END)).toEqual({
        scheduled: true,
        atPeriodEnd: false,
      });
      expect(h.update).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "does not move an add-on's independent explicit cancellation (base resumed: %s)",
    async (resumed) => {
      h.existing.cancelAtPeriodEnd = true;
      h.authoritative = subscription({ cancel_at: resumed ? null : END });
      h.addons = [addon({ cancel_at: END - 86400, cancel_at_period_end: resumed })];
      await syncSubscriptionFromStripe(subscription());
      expect(h.update).not.toHaveBeenCalled();
    },
  );

  it("does not initiate a current-period add-on cancellation for a later custom base end date", async () => {
    h.authoritative = subscription({ cancel_at: END + 86400 });
    h.addons = [addon({ metadata: { purpose: "live_video_addon" } })];
    await syncSubscriptionFromStripe(subscription());
    expect(mirrored()).toMatchObject({
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(END_ISO),
      status: "active",
    });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("preserves the legacy period-end flag and refuses malformed dates as cancellation evidence", () => {
    expect(
      stripeSubscriptionCancellation(
        subscription({ cancel_at: null, cancel_at_period_end: true }),
        END,
      ),
    ).toEqual({ scheduled: true, atPeriodEnd: true });
    for (const cancel_at of [null, 0, -1, NaN, Infinity, 1.5]) {
      expect(stripeSubscriptionCancellation(subscription({ cancel_at }), END)).toEqual({
        scheduled: false,
        atPeriodEnd: false,
      });
    }
    expect(stripeSubscriptionCancellation(subscription(), null)).toEqual({
      scheduled: true,
      atPeriodEnd: false,
    });
  });

  it("retains a terminal Stripe status instead of reviving access because a cancellation date remains", async () => {
    h.authoritative = subscription({ status: "canceled" });
    await syncSubscriptionFromStripe(subscription());
    expect(mirrored().status).toBe("canceled");
    expect(h.writes.find(({ table }) => table === schema.settings)?.set.subscriptionStatus).toBe(
      "canceled",
    );
    expect(h.grant).not.toHaveBeenCalled();
    expect(h.receipt).not.toHaveBeenCalled();
  });
});
