import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    stripeEvents: new Set<string>(),
    subscriptions: {} as Record<string, any>,
    settings: {} as Record<string, any>,
    spendBudgets: {} as Record<string, any>,
    currentWebhookEvent: null as any,
  };

  const schema = {
    stripeEvents: {
      __name: "stripeEvents",
      eventId: "stripeEvents.eventId",
      eventType: "stripeEvents.eventType",
    },
    subscriptions: {
      __name: "subscriptions",
      userId: "subscriptions.userId",
      plan: "subscriptions.plan",
      status: "subscriptions.status",
      stripeCustomerId: "subscriptions.stripeCustomerId",
      stripeSubscriptionId: "subscriptions.stripeSubscriptionId",
    },
    users: {
      __name: "users",
      id: "users.id",
      email: "users.email",
      emailVerifiedAt: "users.emailVerifiedAt",
    },
    settings: {
      __name: "settings",
      userId: "settings.userId",
      extraAgents: "settings.extraAgents",
      signupPlanInterest: "settings.signupPlanInterest",
      signupWedge: "settings.signupWedge",
      acquisitionSource: "settings.acquisitionSource",
      acquisitionMedium: "settings.acquisitionMedium",
      acquisitionCampaign: "settings.acquisitionCampaign",
    },
    spendBudgets: {
      __name: "spendBudgets",
      userId: "spendBudgets.userId",
      monthlyLimitUsd: "spendBudgets.monthlyLimitUsd",
      hardCap: "spendBudgets.hardCap",
      warnThresholdPct: "spendBudgets.warnThresholdPct",
      enabled: "spendBudgets.enabled",
      updatedAt: "spendBudgets.updatedAt",
    },
    spendAlerts: {
      __name: "spendAlerts",
      userId: "spendAlerts.userId",
      thresholdPct: "spendAlerts.thresholdPct",
      firedAt: "spendAlerts.firedAt",
      period: "spendAlerts.period",
    },
    agents: { __name: "agents", userId: "agents.userId" },
    phoneNumbers: { __name: "phoneNumbers", userId: "phoneNumbers.userId" },
  };

  function findEqValue(condition: any, left: string): unknown {
    if (!condition) return undefined;
    if (condition.op === "eq") return condition.left === left ? condition.right : undefined;
    if (condition.op === "and") {
      for (const child of condition.conditions) {
        const value = findEqValue(child, left);
        if (value !== undefined) return value;
      }
    }
    return undefined;
  }

  function mapSubscriptionShape(subscription: Record<string, any>, shape: Record<string, string>) {
    return Object.fromEntries(
      Object.keys(shape).map((key) => {
        switch (key) {
          case "stripeCustomerId":
            return [key, subscription.stripeCustomerId ?? null];
          case "stripeSubscriptionId":
          case "stripe_subscription_id":
            return [key, subscription.stripeSubscriptionId ?? null];
          case "status":
            return [key, subscription.status ?? null];
          case "plan":
            return [key, subscription.plan ?? null];
          case "userId":
            return [key, subscription.userId];
          default:
            return [key, null];
        }
      }),
    );
  }

  function createSelectBuilder(shape?: Record<string, string>) {
    let fromTable: { __name: string } | undefined;
    let whereCondition: any;

    const resolve = () => {
      switch (fromTable?.__name) {
        case "settings": {
          const userId = String(findEqValue(whereCondition, schema.settings.userId) ?? "");
          const subscription = state.subscriptions[userId] ?? null;
          const settings = state.settings[userId] ?? { userId, extraAgents: 0 };
          return [
            shape
              ? {
                  ...Object.fromEntries(
                    Object.keys(shape).map((key) => {
                      switch (key) {
                        case "plan_id":
                          return [key, subscription?.plan ?? null];
                        case "extra_agents":
                          return [key, settings.extraAgents ?? 0];
                        case "signupPlanInterest":
                          return [key, settings.signupPlanInterest ?? null];
                        case "signupWedge":
                          return [key, settings.signupWedge ?? null];
                        case "acquisitionSource":
                          return [key, settings.acquisitionSource ?? null];
                        case "acquisitionMedium":
                          return [key, settings.acquisitionMedium ?? null];
                        case "acquisitionCampaign":
                          return [key, settings.acquisitionCampaign ?? null];
                        default:
                          return [key, null];
                      }
                    }),
                  ),
                }
              : settings,
          ];
        }
        case "subscriptions": {
          const userId = findEqValue(whereCondition, schema.subscriptions.userId);
          const customerId = findEqValue(whereCondition, schema.subscriptions.stripeCustomerId);
          let subscription =
            typeof userId === "string" ? (state.subscriptions[userId] ?? null) : null;
          if (typeof customerId === "string") {
            subscription =
              Object.values(state.subscriptions).find(
                (row) => row.stripeCustomerId === customerId,
              ) ?? null;
          }
          return subscription
            ? [shape ? mapSubscriptionShape(subscription, shape) : subscription]
            : [];
        }
        case "spendAlerts":
          return [];
        case "users": {
          const userId = findEqValue(whereCondition, schema.users.id);
          if (userId === "user-1") return [{ email: "owner@example.com" }];
          return [];
        }
        default:
          return [];
      }
    };

    return {
      from(table: { __name: string }) {
        fromTable = table;
        return this;
      },
      leftJoin() {
        return this;
      },
      where(condition: any) {
        whereCondition = condition;
        return this;
      },
      limit() {
        return Promise.resolve(resolve());
      },
      orderBy() {
        return Promise.resolve(resolve());
      },
    };
  }

  const drizzle = {
    select: vi.fn((shape?: Record<string, string>) => createSelectBuilder(shape)),
    insert: vi.fn((table: { __name: string }) => ({
      values(value: Record<string, any>) {
        if (table.__name === "stripeEvents") {
          if (state.stripeEvents.has(value.eventId)) {
            const error = new Error("duplicate key");
            Object.assign(error, { code: "23505" });
            throw error;
          }
          state.stripeEvents.add(value.eventId);
          return Promise.resolve();
        }
        if (table.__name === "subscriptions") {
          const existing = state.subscriptions[value.userId] ?? { userId: value.userId };
          state.subscriptions[value.userId] = {
            ...existing,
            stripeCustomerId: value.stripeCustomerId ?? existing.stripeCustomerId ?? null,
            stripeSubscriptionId:
              value.stripeSubscriptionId ?? existing.stripeSubscriptionId ?? null,
            plan: value.plan ?? existing.plan ?? null,
            status: value.status ?? existing.status ?? null,
          };
          return {
            onConflictDoUpdate() {
              return Promise.resolve();
            },
          };
        }
        if (table.__name === "spendBudgets") {
          state.spendBudgets[value.userId] = value;
          return {
            onConflictDoUpdate() {
              return {
                returning() {
                  return Promise.resolve([value]);
                },
              };
            },
          };
        }
        return Promise.resolve();
      },
    })),
    update: vi.fn((table: { __name: string }) => ({
      set(values: Record<string, any>) {
        return {
          where(condition: any) {
            if (table.__name === "settings") {
              const userId = String(findEqValue(condition, schema.settings.userId));
              state.settings[userId] = { ...(state.settings[userId] ?? { userId }), ...values };
            }
            return Promise.resolve();
          },
        };
      },
    })),
    delete: vi.fn((table: { __name: string }) => ({
      where(condition: any) {
        if (table.__name === "stripeEvents") {
          const eventId = String(findEqValue(condition, schema.stripeEvents.eventId));
          state.stripeEvents.delete(eventId);
        }
        return Promise.resolve();
      },
    })),
  };

  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const auditLogger = {
    logAuth: vi.fn().mockResolvedValue(undefined),
    logBilling: vi.fn().mockResolvedValue(undefined),
  };

  const stripe = {
    webhooks: {
      constructEvent: vi.fn((body: Buffer, signature: string, secret: string) => {
        if (!Buffer.isBuffer(body)) throw new Error("raw body required");
        if (secret !== process.env.STRIPE_WEBHOOK_SECRET) throw new Error("wrong secret");
        if (signature !== "good-sig") throw new Error("invalid signature");
        return state.currentWebhookEvent;
      }),
    },
    subscriptions: {
      retrieve: vi.fn(async () => ({ id: "sub_live", items: { data: [] } })),
    },
    customers: {
      create: vi.fn(async () => ({ id: "cus_new" })),
      update: vi.fn(async () => ({ id: "cus_existing" })),
      retrieve: vi.fn(async () => ({ id: "cus_existing" })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://stripe.test/checkout/session" })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async () => ({ url: "https://stripe.test/portal/session" })),
      },
    },
    subscriptionItems: {
      create: vi.fn(async () => ({ id: "si_new" })),
      update: vi.fn(async () => ({ id: "si_updated" })),
      del: vi.fn(async () => ({ id: "si_deleted" })),
    },
  };

  return {
    state,
    schema,
    drizzle,
    log,
    auditLogger,
    stripe,
    stripeAvailable: vi.fn(() => true),
    syncSubscriptionFromStripe: vi.fn(async () => undefined),
    verifyInternalJwt: vi.fn(async (token: string) =>
      token === "valid-token"
        ? {
            sub: "user-1",
            email: "owner@example.com",
            aud: "authenticated",
            role: "authenticated",
            iat: Math.floor(Date.now() / 1000),
          }
        : null,
    ),
    requireInternalJwtSecret: vi.fn(() => "x".repeat(32)),
    clearBudgetCache: vi.fn(),
    sendPaymentFailedEmail: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("../env", () => ({ env: { DATABASE_URL: "postgres://test" } }));
vi.mock("../db/schema", () => h.schema);
vi.mock("drizzle-orm", () => ({
  eq: (left: string, right: unknown) => ({ op: "eq", left, right }),
  and: (...conditions: any[]) => ({ op: "and", conditions }),
  count: () => ({ op: "count" }),
}));
vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: h.log,
  auditLogger: h.auditLogger,
  tenantStore: { run: (_id: string, fn: () => unknown) => fn(), getStore: () => undefined },
}));
vi.mock("../lib/stripe-helpers", () => ({
  stripe: h.stripe,
  stripeAvailable: h.stripeAvailable,
  syncSubscriptionFromStripe: h.syncSubscriptionFromStripe,
  subscriptionCheckoutLineItems: vi.fn((_plan: unknown, interval: string) => [
    { price: interval === "year" ? "price_annual" : "price_monthly", quantity: 1 },
  ]),
}));
vi.mock("../lib/auth-utils", () => ({ verifyInternalJwt: h.verifyInternalJwt }));
vi.mock("../lib/internal-jwt-secret", () => ({
  requireInternalJwtSecret: h.requireInternalJwtSecret,
}));
vi.mock("../lib/server-utils", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));
vi.mock("../lib/email-service", () => ({ sendPaymentFailedEmail: h.sendPaymentFailedEmail }));
vi.mock("../lib/spend-guards", () => ({
  clearBudgetCache: h.clearBudgetCache,
  getBudgetSnapshot: vi.fn(async () => ({ period: "2026-01", mtdCost: 0, budget: null })),
}));
vi.mock("../lib/phone-line-entitlements", () => ({
  getIncludedPhoneLineSlots: vi.fn(async () => 1),
}));
vi.mock("../lib/voice-usage", () => ({
  getVoiceUsageSnapshot: vi.fn(async () => ({ total_minutes: 0 })),
}));
vi.mock("../lib/workspace-usage-snapshot", () => ({
  getWorkspaceUsageSnapshot: vi.fn(async () => ({
    plan_id: null,
    plan_name: null,
    voice_minutes_used: 0,
    voice_minutes_included: 0,
    voice_minutes_remaining: 0,
    voice_usage_pct: 0,
    voice_minutes_cap: 0,
    overage_minutes: 0,
    overage_per_min_usd: 0,
    overage_cost_usd: 0,
    period_key: "2026-05",
    reset_at: "2026-06-01T00:00:00.000Z",
    stripe_metered: false,
    ai_spend_usd: 0,
    ai_spend_limit_usd: 0,
    ai_spend_pct: 0,
    ai_spend_hard_cap: true,
    claude_tokens_used_today: 0,
    claude_tokens_daily_limit: 0,
    claude_tokens_pct: 0,
    openrouter_allowed: false,
    usage_pct: 0,
  })),
}));

async function buildApp() {
  const billingModule = await import("./billing-routes");
  const billingRouter = billingModule.default as any;
  const app = express();
  app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use("/api", billingRouter);
  return app;
}

describe("billing routes integration", () => {
  beforeEach(() => {
    h.state.stripeEvents = new Set();
    h.state.subscriptions = {
      "user-1": {
        userId: "user-1",
        plan: "starter",
        status: "active",
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_live",
      },
    };
    h.state.settings = {
      "user-1": {
        userId: "user-1",
        extraAgents: 2,
        signupPlanInterest: "starter",
        signupWedge: "sales",
        acquisitionSource: "ads",
        acquisitionMedium: "search",
        acquisitionCampaign: "launch",
      },
    };
    h.state.spendBudgets = {};
    h.state.currentWebhookEvent = {
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", subscription: "sub_live" } },
    };

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.STRIPE_STARTER_EXTRA_AGENT_PRICE_ID = "price_extra_starter";

    vi.clearAllMocks();
    h.stripeAvailable.mockReturnValue(true);
    h.requireInternalJwtSecret.mockReturnValue("x".repeat(32));
    h.verifyInternalJwt.mockImplementation(async (token: string) =>
      token === "valid-token"
        ? {
            sub: "user-1",
            email: "owner@example.com",
            aud: "authenticated",
            role: "authenticated",
            iat: Math.floor(Date.now() / 1000),
          }
        : null,
    );
    h.stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub_live", items: { data: [] } });
    h.stripe.subscriptionItems.create.mockResolvedValue({ id: "si_new" });
    h.syncSubscriptionFromStripe.mockResolvedValue(undefined);
  });

  it("rejects missing Stripe webhook signatures", async () => {
    const response = await request(await buildApp())
      .post("/api/stripe-webhook")
      .set("content-type", "application/json")
      .send(JSON.stringify({ ok: true }));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Missing stripe-signature header." });
    expect(h.stripe.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it("rejects bad Stripe webhook signatures", async () => {
    const response = await request(await buildApp())
      .post("/api/stripe-webhook")
      .set("stripe-signature", "bad-sig")
      .set("content-type", "application/json")
      .send(JSON.stringify({ ok: true }));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Webhook signature verification failed." });
    expect(h.log.warn).toHaveBeenCalledWith(
      "Stripe webhook signature verification failed",
      expect.objectContaining({ sig_prefix: "bad-sig" }),
    );
  });

  it("accepts valid webhook signatures and processes the event once", async () => {
    const app = await buildApp();

    const first = await request(app)
      .post("/api/stripe-webhook")
      .set("stripe-signature", "good-sig")
      .set("content-type", "application/json")
      .send(JSON.stringify({ ok: true }));
    const second = await request(app)
      .post("/api/stripe-webhook")
      .set("stripe-signature", "good-sig")
      .set("content-type", "application/json")
      .send(JSON.stringify({ ok: true }));

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(h.stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_live");
    expect(h.syncSubscriptionFromStripe).toHaveBeenCalledTimes(1);
    expect(h.log.info).toHaveBeenCalledWith(
      "Stripe webhook duplicate event ignored",
      expect.objectContaining({ eventId: "evt_checkout_1" }),
    );
  });

  it("requires auth for checkout session creation", async () => {
    const response = await request(await buildApp())
      .post("/api/billing/checkout")
      .send({ plan_id: "starter" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "No authorization token provided" });
    expect(h.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("lists the expected billing tiers", async () => {
    const response = await request(await buildApp()).get("/api/billing/plans");

    expect(response.status).toBe(200);
    expect(response.body.stripe_configured).toBe(true);
    expect(response.body.plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "personal", price_usd_monthly: 49 }),
        expect.objectContaining({ id: "starter", price_usd_monthly: 149 }),
        expect.objectContaining({ id: "pro", price_usd_monthly: 499 }),
        expect.objectContaining({ id: "business", price_usd_monthly: 1499 }),
        expect.objectContaining({ id: "enterprise", price_usd_monthly: 0, contact_sales: true }),
      ]),
    );
  });

  it("reads and updates extra-agent billing", async () => {
    const app = await buildApp();

    const getResponse = await request(app)
      .get("/api/billing/extra-agents")
      .set("Authorization", ["Bearer", "valid-token"].join(" "));
    const postResponse = await request(app)
      .post("/api/billing/extra-agents")
      .set("Authorization", ["Bearer", "valid-token"].join(" "))
      .send({ count: 4 });

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({
      plan_id: "starter",
      plan_name: "Starter",
      included_agents: 3,
      extra_agents: 2,
      extra_agent_price_usd: 45,
      configured: true,
    });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body).toEqual({ ok: true, extra_agents: 4, agents_total: 7 });
    expect(h.stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_live");
    expect(h.stripe.subscriptionItems.create).toHaveBeenCalledWith({
      subscription: "sub_live",
      price: "price_extra_starter",
      quantity: 4,
    });
    expect(h.state.settings["user-1"].extraAgents).toBe(4);
  });

  it("rejects invalid spend budget payloads before hitting persistence", async () => {
    const response = await request(await buildApp())
      .put("/api/spend/budget")
      .set("Authorization", ["Bearer", "valid-token"].join(" "))
      .send({ monthly_limit_usd: -1, warn_threshold_pct: 80, hard_cap: false, enabled: true });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.error).toMatch(/>=0|greater than or equal to 0/i);
    expect(h.clearBudgetCache).not.toHaveBeenCalled();
  });

  it("persists spend budget with hard cap and clears cache", async () => {
    const response = await request(await buildApp())
      .put("/api/spend/budget")
      .set("Authorization", ["Bearer", "valid-token"].join(" "))
      .send({ monthly_limit_usd: 250, warn_threshold_pct: 85, hard_cap: true, enabled: true });

    expect(response.status).toBe(200);
    expect(response.body.budget).toEqual(
      expect.objectContaining({
        userId: "user-1",
        monthlyLimitUsd: "250",
        hardCap: true,
        warnThresholdPct: 85,
        enabled: true,
      }),
    );
    expect(h.clearBudgetCache).toHaveBeenCalledWith("user-1");
    expect(h.state.spendBudgets["user-1"].monthlyLimitUsd).toBe("250");
  });

  it("returns voice usage snapshot from /billing/usage", async () => {
    const { getWorkspaceUsageSnapshot } = await import("../lib/workspace-usage-snapshot");
    vi.mocked(getWorkspaceUsageSnapshot).mockResolvedValueOnce({
      plan_id: "starter",
      plan_name: "Starter",
      voice_minutes_used: 1250,
      voice_minutes_included: 1200,
      voice_minutes_remaining: 0,
      voice_minutes_cap: 1200,
      voice_usage_pct: 100,
      overage_minutes: 50,
      overage_per_min_usd: 0.18,
      overage_cost_usd: 9,
      period_key: "2026-05",
      reset_at: "2026-06-01T00:00:00.000Z",
      stripe_metered: true,
      ai_spend_usd: 0,
      ai_spend_limit_usd: 35,
      ai_spend_pct: 0,
      ai_spend_hard_cap: true,
      claude_tokens_used_today: 0,
      claude_tokens_daily_limit: 1_500_000,
      claude_tokens_pct: 0,
      openrouter_allowed: false,
      usage_pct: 100,
    });

    const response = await request(await buildApp())
      .get("/api/billing/usage")
      .set("Authorization", ["Bearer", "valid-token"].join(" "));

    expect(response.status).toBe(200);
    expect(response.body.overage_minutes).toBe(50);
    expect(response.body.overage_cost_usd).toBe(9);
  });

  it("invoice.payment_failed sends dunning email and audit log", async () => {
    h.state.currentWebhookEvent = {
      id: "evt_inv_fail_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail_1",
          customer: "cus_existing",
          amount_due: 14900,
          attempt_count: 2,
          hosted_invoice_url: "https://stripe.test/invoice/in_fail_1",
        },
      },
    };

    const response = await request(await buildApp())
      .post("/api/stripe-webhook")
      .set("stripe-signature", "good-sig")
      .set("content-type", "application/json")
      .send(JSON.stringify({}));

    expect(response.status).toBe(200);
    expect(h.auditLogger.logBilling).toHaveBeenCalledWith(
      "payment_failed",
      expect.objectContaining({
        userId: "user-1",
        customerId: "cus_existing",
        amountCents: 14900,
      }),
    );
    expect(h.sendPaymentFailedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        amountDisplay: "$149.00",
        invoiceUrl: "https://stripe.test/invoice/in_fail_1",
        updateCardUrl: expect.stringMatching(/\/billing$/),
      }),
    );
  });

  it("customer.subscription.updated syncs plan change (upgrade path)", async () => {
    h.state.currentWebhookEvent = {
      id: "evt_sub_up_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_live",
          customer: "cus_existing",
          status: "active",
          items: { data: [{ price: { id: "price_pro_monthly" } }] },
        },
      },
    };

    const response = await request(await buildApp())
      .post("/api/stripe-webhook")
      .set("stripe-signature", "good-sig")
      .set("content-type", "application/json")
      .send(JSON.stringify({}));

    expect(response.status).toBe(200);
    expect(h.syncSubscriptionFromStripe).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_live", status: "active" }),
    );
  });
});
