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

vi.mock("../src/lib/spend-guards", () => ({ clearBudgetCache: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());

describe("channel packages", () => {
  it.each([
    ["voice", ["voice"], 15, 1.5, 1, 0],
    ["email", ["email"], 9, 2.5, 0, 1],
    ["sms", ["sms"], 12, 2.5, 1, 0],
    ["voice-email", ["voice", "email"], 21, 2.5, 1, 1],
    ["voice-sms", ["voice", "sms"], 20, 2.5, 1, 0],
    ["email-sms", ["email", "sms"], 18, 3.5, 1, 1],
    ["omnichannel", ["voice", "email", "sms"], 26, 3.5, 1, 1],
  ] as const)(
    "resolves %s without allocating unused resources",
    (id, channels, price, allowance, numbers, mailboxes) => {
      const plan = channelPlanForSelection(channels)!;
      expect(plan.id).toBe(id);
      expect(channelPlanForSelection([...channels].reverse())?.id).toBe(id);
      expect(channelPlanForSelection([...channels, ...channels])?.id).toBe(id);
      expect(plan).toMatchObject({
        price_usd_monthly: price,
        price_usd_annual: price * 10,
        max_agents: 1,
        included_phone_numbers: numbers,
        included_mailboxes: mailboxes,
      });
      expect(plan.voice_minutes_monthly).toBe(plan.channels.includes("voice") ? 30 : 0);
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
      ["voice", [15, 150, 59, 690, 219, 2499]],
      ["email", [9, 90, 29, 290, 69, 690]],
      ["sms", [12, 120, 29, 339, 79, 899]],
      ["voice-email", [21, 210, 79, 899, 269, 2999]],
      ["voice-sms", [20, 200, 79, 939, 279, 3199]],
      ["email-sms", [18, 180, 49, 499, 129, 1399]],
      ["omnichannel", [26, 260, 99, 1109, 319, 3699]],
    ] as const;
    expect(STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels")).toHaveLength(21);
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
          plan.channels.includes("voice") ? [30, 250, 1000][index] : 0,
        );
        expect(voiceMinutesDailyQuotaForPlan(id)).toBe(
          plan.channels.includes("voice") ? [60, 250, 1000][index] : 0,
        );
        expect(plan.included_phone_numbers).toBe(planById(base)!.included_phone_numbers);
        expect(plan.included_mailboxes).toBe(planById(base)!.included_mailboxes);
        expect(planByStripePrice({ lookup_key: plan.lookupKeyAnnual })?.id).toBe(id);
        expect(plan.extra_agent_price_usd).toBeUndefined();
      }
    }
    expect(defaultAiSpendBudgetUsdForPlan("email-regular")).toBe(10);
    expect(defaultAiSpendBudgetUsdForPlan("omnichannel-high")).toBe(40);
    expect(planById("voice-regular")!.price_usd_monthly).toBeLessThan(15 + 220 * 0.22);
    expect(planById("voice-high")!.price_usd_monthly).toBeLessThan(15 + 970 * 0.22);
  });

  it("does not invent a package or entitlement from unknown selections", () => {
    expect(channelPlanForSelection([])).toBeNull();
    expect(channelPlanForSelection(["fax" as CommunicationChannel])).toBeNull();
    expect(planIncludesChannel("personal", "voice")).toBe(false);
    expect(planIncludesChannel("missing", "email")).toBe(false);
  });
  it("carries exact capacity through daily profiles without increasing concurrency or reviving disabled overrides", () => {
    const disabled = [
      { user_id: "owner", dimension: "voice_minutes_daily" as const, value: 30, enabled: false },
    ];
    for (const [id, daily] of [
      ["voice", 60],
      ["voice-regular", 250],
      ["voice-high", 1000],
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
