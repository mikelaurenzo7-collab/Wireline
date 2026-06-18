/**
 * stripe-helpers.sync.test.ts — subscription mirror on plan change / dunning states.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncSubscriptionFromStripe } from "./stripe-helpers";

const h = vi.hoisted(() => ({
  subscription: {
    userId: "user-1",
    stripeCustomerId: "cus_1",
    status: "active",
    plan: "starter",
  },
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
  invalidateDashboard: vi.fn(),
}));

vi.mock("./server-context", () => ({
  drizzle: {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [h.subscription]),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLogger: { logBilling: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../db/schema", () => ({
  subscriptions: { userId: "userId", stripeCustomerId: "stripeCustomerId" },
  settings: { userId: "userId" },
  spendBudgets: { userId: "userId", monthlyLimitUsd: "monthlyLimitUsd" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("./webhook-helpers", () => ({ dispatchWebhook: h.dispatchWebhook }));
vi.mock("./dashboard-cache", () => ({ invalidateDashboard: h.invalidateDashboard }));
vi.mock("./workspace-usage-snapshot", () => ({
  ensureDefaultAiSpendBudget: vi.fn().mockResolvedValue(undefined),
}));

describe("syncSubscriptionFromStripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
    process.env.STRIPE_BUSINESS_STARTER_PRICE_ID = "price_business_starter_monthly";
    h.subscription = {
      userId: "user-1",
      stripeCustomerId: "cus_1",
      status: "active",
      plan: "starter",
    };
  });

  it("dispatches subscription.changed with starter plan on upgrade price id", async () => {
    await syncSubscriptionFromStripe({
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_pro_monthly" } }] },
    } as any);

    expect(h.invalidateDashboard).toHaveBeenCalledWith("user-1");
    expect(h.dispatchWebhook).toHaveBeenCalledWith(
      "user-1",
      "subscription.changed",
      expect.objectContaining({
        plan: "starter",
        status: "active",
        legacy_status: "active",
      }),
    );
  });

  it("maps past_due Stripe status to legacy past_due for feature gates", async () => {
    await syncSubscriptionFromStripe({
      id: "sub_1",
      customer: "cus_1",
      status: "past_due",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_business_starter_monthly" } }] },
    } as any);

    expect(h.dispatchWebhook).toHaveBeenCalledWith(
      "user-1",
      "subscription.changed",
      expect.objectContaining({
        plan: "business-starter",
        status: "past_due",
        legacy_status: "past_due",
      }),
    );
  });
});
