import { afterEach, describe, expect, it, vi } from "vitest";
import {
  channelPlanForSelection,
  planById,
  planByPriceId,
  planByStripePrice,
  planIncludesChannel,
  plansForClient,
  STRIPE_PLANS,
  estimatedPlanMonthlyCosts,
  type CommunicationChannel,
} from "../src/lib/plan-catalog";
import {
  defaultAiSpendBudgetUsdForPlan,
  subscriptionPlanToTier,
  voiceMinutesDailyQuotaForPlan,
} from "../src/lib/plan-entitlements";
import { ensureDefaultAiSpendBudget } from "../src/lib/workspace-usage-snapshot";
import { resolveProfile } from "../src/lib/tenant-quotas";
import { agentCapHit, resolveAgentEntitlement } from "../src/lib/agent-entitlements";
import { includedPhoneSlotsForPlan } from "../src/lib/phone-line-entitlements";

vi.mock("../src/lib/spend-guards", () => ({ clearBudgetCache: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

describe("channel packages", () => {
  it.each([
    ["voice", ["voice"], 19, 199, 1.5, 1, 0],
    ["email", ["email"], 9, 90, 2.5, 0, 1],
    ["sms", ["sms"], 12, 120, 2.5, 1, 0],
    ["voice-email", ["voice", "email"], 25, 259, 2.5, 1, 1],
    ["voice-sms", ["voice", "sms"], 24, 249, 2.5, 1, 0],
    ["email-sms", ["email", "sms"], 18, 180, 3.5, 1, 1],
    ["omnichannel", ["voice", "email", "sms"], 29, 309, 3.5, 1, 1],
  ] as const)(
    "resolves %s without allocating unused resources",
    (id, channels, price, annual, allowance, numbers, mailboxes) => {
      const plan = channelPlanForSelection(channels)!;
      expect(plan.id).toBe(id);
      expect(channelPlanForSelection([...channels].reverse())?.id).toBe(id);
      expect(channelPlanForSelection([...channels, ...channels])?.id).toBe(id);
      expect(plan).toMatchObject({
        price_usd_monthly: price,
        price_usd_annual: annual,
        max_agents: 1,
        included_phone_numbers: numbers,
        included_mailboxes: mailboxes,
      });
      expect(plan.voice_minutes_monthly).toBe(plan.channels.includes("voice") ? 50 : 0);
      expect(plan.extraAgentPriceIdEnv).toBeUndefined();
      expect(defaultAiSpendBudgetUsdForPlan(id)).toBe(allowance);
      expect(subscriptionPlanToTier(id)).toBe("personal");
      for (const channel of ["voice", "email", "sms"] as const)
        expect(planIncludesChannel(id, channel)).toBe(plan.channels.includes(channel));
      expect(estimatedPlanMonthlyCosts(plan, "month").mailboxesUsd).toBe(mailboxes * 2);
    },
  );

  it("resolves all 21 channel/capacity packages with exact independent annual prices", () => {
    const offers = [
      ["voice", [19, 199, 59, 690, 115, 1349]],
      ["email", [9, 90, 29, 290, 69, 690]],
      ["sms", [12, 120, 29, 339, 79, 899]],
      ["voice-email", [25, 259, 79, 899, 159, 1799]],
      ["voice-sms", [24, 249, 79, 939, 179, 2039]],
      ["email-sms", [18, 180, 49, 499, 129, 1399]],
      ["omnichannel", [29, 309, 99, 1109, 219, 2549]],
    ] as const;
    expect(STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels")).toHaveLength(22);
    for (const [base, prices] of offers) {
      for (const [index, tier] of (["light", "regular", "high"] as const).entries()) {
        const id = index ? `${base}-${tier}` : base;
        const plan = planById(id)!;
        expect(channelPlanForSelection(planById(base)!.channels, tier)?.id).toBe(id);
        expect(plan).toMatchObject({
          capacityTier: tier,
          price_usd_monthly: prices[index * 2],
          price_usd_annual: prices[index * 2 + 1],
          max_agents: 1,
        });
        expect(plan.voice_minutes_monthly).toBe(
          plan.channels.includes("voice") ? [50, 250, 500][index] : 0,
        );
        expect(voiceMinutesDailyQuotaForPlan(id)).toBe(
          plan.channels.includes("voice") ? [60, 250, 500][index] : 0,
        );
        expect(plan.included_phone_numbers).toBe(planById(base)!.included_phone_numbers);
        expect(plan.included_mailboxes).toBe(planById(base)!.included_mailboxes);
        expect(planByStripePrice({ lookup_key: plan.lookupKeyAnnual })?.id).toBe(id);
        expect(plan.extra_agent_price_usd).toBeUndefined();
      }
    }
    expect(defaultAiSpendBudgetUsdForPlan("email-regular")).toBe(10);
    expect(defaultAiSpendBudgetUsdForPlan("omnichannel-high")).toBe(40);
    expect(planById("voice-regular")!.price_usd_monthly).toBeLessThan(19 + 200 * 0.22);
    expect(planById("voice-high")!.price_usd_monthly).toBeLessThan(19 + 450 * 0.22);
  });

  it("does not invent a package or entitlement from unknown selections", () => {
    expect(channelPlanForSelection([])).toBeNull();
    expect(channelPlanForSelection(["fax" as CommunicationChannel])).toBeNull();
    expect(planIncludesChannel("personal", "voice")).toBe(true);
    expect(planIncludesChannel("personal", "email")).toBe(false);
    expect(planIncludesChannel("missing", "email")).toBe(false);
  });
  it("revisions changed Calls prices without re-keying unchanged capacity or channel offers", () => {
    for (const plan of STRIPE_PLANS.filter(
      (item) => item.catalogFamily === "channels" && item.id !== "personal",
    )) {
      const changed = plan.channels.includes("voice") && plan.capacityTier !== "regular";
      for (const key of [plan.lookupKeyMonthly, plan.lookupKeyAnnual]) {
        expect(key).toMatch(changed ? /_v2$/ : /_v1$/);
        expect(planByStripePrice({ lookup_key: key })?.id).toBe(plan.id);
      }
      if (changed) {
        // Historical webhook recognition remains separate from new-sale price
        // authorization; do not strand events from a superseded test price.
        expect(
          planByStripePrice({ lookup_key: `${plan.id}_monthly_channels_2026_09_v1` })?.id,
        ).toBe(plan.id);
      }
    }
  });
  it("keeps all 21 packages above normal and stressed cost floors on both intervals", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      for (const interval of ["month", "year"] as const) {
        for (const [voiceCostPerMinuteUsd, utilization, floor] of [
          [0.128, 1, 0.3],
          [0.128, 0.7, 0.45],
          [0.14, 1, 0.25],
          [0.14, 0.7, 0.4],
        ]) {
          const costs = estimatedPlanMonthlyCosts(plan, interval, {
            voiceCostPerMinuteUsd,
            utilization,
          });
          expect(
            (costs.revenueUsd - costs.totalCostUsd) / costs.revenueUsd,
            `${plan.id} ${interval} voice=${voiceCostPerMinuteUsd} utilization=${utilization}`,
          ).toBeGreaterThanOrEqual(floor);
        }
        if (plan.channels.length > 1) {
          const priceKey = interval === "year" ? "price_usd_annual" : "price_usd_monthly";
          const separate = plan.channels.reduce(
            (sum, channel) =>
              sum + channelPlanForSelection([channel], plan.capacityTier)![priceKey],
            0,
          );
          expect(plan[priceKey], `${plan.id} ${interval} bundle savings`).toBeLessThan(separate);
        }
      }
    }
  });
  it("does not cap Bot creation by package while phone and email stay plan resources", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      const entitlement = resolveAgentEntitlement({
        isOwner: false,
        planId: plan.id,
        subscriptionStatus: "active",
        maxAgents: 1,
        extraAgents: 0,
      });
      expect(entitlement.unlimited, plan.id).toBe(true);
      expect(entitlement.effectiveCap, plan.id).toBeNull();
      expect(agentCapHit(plan.max_agents, entitlement), plan.id).toBe(false);
      expect(includedPhoneSlotsForPlan(plan.id, 0), plan.id).toBe(plan.included_phone_numbers);
      expect(plan.included_phone_numbers).toBe(
        Number(plan.channels.some((channel) => channel === "voice" || channel === "sms")),
      );
      expect(plan.included_mailboxes).toBe(Number(plan.channels.includes("email")));
      const inactive = resolveAgentEntitlement({
        isOwner: false,
        planId: plan.id,
        subscriptionStatus: "past_due",
        maxAgents: plan.max_agents,
      });
      expect(inactive.unlimited).toBe(true);
      expect(inactive.effectiveCap).toBeNull();
    }
  });
  it("carries exact capacity through daily profiles without increasing concurrency or reviving disabled overrides", () => {
    const disabled = [
      { user_id: "owner", dimension: "voice_minutes_daily" as const, value: 30, enabled: false },
    ];
    for (const [id, daily] of [
      ["voice", 60],
      ["voice-regular", 250],
      ["voice-high", 500],
    ] as const) {
      const profile = resolveProfile(subscriptionPlanToTier(id), disabled, id);
      expect(profile.voice_minutes_daily).toBe(daily);
      expect(profile.concurrent_dials).toBe(resolveProfile("personal", []).concurrent_dials);
    }
    expect(
      resolveProfile("personal", [{ ...disabled[0], enabled: true, value: 45 }], "voice-high")
        .voice_minutes_daily,
    ).toBe(45);
    expect(resolveProfile("personal", [], "email-high").voice_minutes_daily).toBe(0);
  });

  it("exposes an explicitly released annual interval without requiring its monthly price", () => {
    vi.stubEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED", "true");
    vi.stubEnv("WIRELINE_LAUNCH_DEMO_MODE", "false");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("STRIPE_EMAIL_PRICE_ID", "");
    vi.stubEnv("STRIPE_EMAIL_ANNUAL_PRICE_ID", "price_annual_only");
    expect(plansForClient().find((plan) => plan.id === "email")).toMatchObject({
      configured: false,
      annual_configured: true,
      contact_sales: false,
    });
  });

  it("keeps SMS unavailable even when configured and the global release is open", () => {
    vi.stubEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED", "true");
    vi.stubEnv("WIRELINE_LAUNCH_DEMO_MODE", "false");
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      vi.stubEnv(plan.priceIdEnv!, "price_configured");
      vi.stubEnv(plan.annualPriceIdEnv!, "price_annual_configured");
    }
    const rows = plansForClient();
    expect(
      rows
        .filter((plan) => plan.checkout_availability === "available" && !plan.is_free)
        .map((plan) => plan.id),
    ).toEqual([
      "personal",
      "voice",
      "voice-regular",
      "voice-high",
      "email",
      "email-regular",
      "email-high",
      "voice-email",
      "voice-email-regular",
      "voice-email-high",
    ]);
    for (const row of rows.filter((plan) => plan.channels.includes("sms")))
      expect(row).toMatchObject({
        checkout_availability: "sms_readiness_required",
        configured: false,
        annual_configured: false,
        extra_agent_configured: false,
      });
  });

  it("retains old bare price IDs and distinct lookup prefixes without offering legacy checkout", () => {
    const old = planById("starter")!;
    vi.stubEnv(old.priceIdEnv!, "price_override");
    expect(planByPriceId(old.fallbackPriceId)?.id).toBe("starter");
    expect(old.voice_minutes_monthly).toBe(50);
    expect(old.price_usd_monthly).toBe(19);
    expect(old.channels).toEqual(["voice", "email", "sms"]);
    expect(defaultAiSpendBudgetUsdForPlan("team")).toBe(3);
    expect(planByStripePrice({ lookup_key: "voice-email_annual_channels_2026_09_v1" })?.id).toBe(
      "voice-email",
    );
    expect(plansForClient().some((plan) => plan.id === "starter")).toBe(false);
  });
});

describe("persisted package allowance", () => {
  function executor(current: { monthlyLimitUsd: string; managedDefault: boolean } | null) {
    const values = vi.fn(() => ({ onConflictDoUpdate: vi.fn(async () => undefined) }));
    return {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () =>
              current ? [{ ...current, enabled: true, hardCap: true, warnThresholdPct: 80 }] : [],
          }),
        }),
      })),
      insert: vi.fn(() => ({ values })),
      values,
    };
  }
  it("seeds Email's full allowance instead of the representative quota-tier budget", async () => {
    const db = executor(null);
    await ensureDefaultAiSpendBudget("owner", "email", db);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyLimitUsd: "2.5", hardCap: true, enabled: true }),
    );
  });
  it("sets one shared workspace AI allowance for each capacity tier", async () => {
    for (const [planId, allowance] of [
      ["email-regular", "10"],
      ["email-high", "30"],
      ["voice-regular", "3"],
      ["voice-high", "5"],
    ] as const) {
      const db = executor(null);
      await ensureDefaultAiSpendBudget("workspace-owner", planId, db);
      expect(db.values).toHaveBeenCalledTimes(1);
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "workspace-owner", monthlyLimitUsd: allowance }),
      );
    }
  });
  it("updates managed defaults while preserving a deliberately lower user cap", async () => {
    const managed = executor({ monthlyLimitUsd: "1.5", managedDefault: true });
    await ensureDefaultAiSpendBudget("owner", "email-sms", managed);
    expect(managed.values).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyLimitUsd: "3.5" }),
    );
    const lower = executor({ monthlyLimitUsd: "1", managedDefault: false });
    await ensureDefaultAiSpendBudget("owner", "email", lower);
    expect(lower.insert).not.toHaveBeenCalled();
    const legacy = executor({ monthlyLimitUsd: "3", managedDefault: true });
    await ensureDefaultAiSpendBudget("owner", "team", legacy);
    expect(legacy.insert).not.toHaveBeenCalled();
  });
});
