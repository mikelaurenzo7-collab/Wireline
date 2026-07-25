import { afterEach, describe, expect, it } from "vitest";
import {
  EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  STRIPE_PLANS,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  estimatedContributionMarginAtFullIncludedUsage,
  planById,
  planByPriceId,
  planByStripePrice,
} from "./plan-catalog";

const STRIPE_PLAN_ENV_KEYS = [
  "STRIPE_PERSONAL_PRICE_ID",
  "STRIPE_STARTER_9_PRICE_ID",
  "STRIPE_STARTER_PRICE_ID",
  "STRIPE_TEAM_PRICE_ID",
  "STRIPE_BUSINESS_PRICE_ID",
] as const;

afterEach(() => {
  for (const key of STRIPE_PLAN_ENV_KEYS) delete process.env[key];
});

describe("plan-catalog", () => {
  it("keeps Personal as the public $0 Free Builder tier", () => {
    const personal = planById("personal");
    expect(personal?.name).toBe("Wireline Free Builder");
    expect(personal?.public).toBe(true);
    expect(personal?.price_usd_monthly).toBe(0);
  });

  it("maps the Founder Early Access tiers to their public names", () => {
    expect(planById("starter")?.name).toBe("Wireline Starter");
    expect(planById("team")?.name).toBe("Wireline Starter Plus");
    expect(planById("business")?.name).toBe("Wireline Pro");
    expect(planById("enterprise")?.name).toBe("Wireline Business");
  });

  it("keeps the canonical Stripe plan identifiers aligned to the commercial model", () => {
    expect(STRIPE_PLANS).toHaveLength(5);
    expect(STRIPE_PLANS.map((plan) => plan.id)).toEqual([
      "personal",
      "starter",
      "team",
      "business",
      "enterprise",
    ]);
  });

  it("keeps Enterprise the top self-serve capacity tier", () => {
    const enterprise = planById("enterprise");
    expect(enterprise?.name).toBe("Wireline Business");
    expect(enterprise?.price_usd_monthly).toBe(149);
    expect(enterprise?.max_agents).toBe(15);
  });

  it("keeps paid plans positive and overage above variable voice cost", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      expect(plan.price_usd_monthly).toBeGreaterThan(0);
      expect(plan.overage_per_min_usd).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
    }
  });

  it("locks canonical Founder Early Access voice and capacity rates", () => {
    expect(planById("starter")?.voice_minutes_monthly).toBe(20);
    expect(planById("team")?.voice_minutes_monthly).toBe(50);
    expect(planById("team")?.max_agents).toBe(2);
    expect(planById("team")?.included_phone_numbers).toBe(2);
    expect(planById("team")?.price_usd_monthly).toBe(24);
    expect(planById("team")?.price_usd_annual).toBe(240);
    expect(planById("business")?.voice_minutes_monthly).toBe(100);
    expect(planById("enterprise")?.voice_minutes_monthly).toBe(250);
    expect(planById("team")?.overage_per_min_usd).toBe(0.22);
    expect(planById("business")?.overage_per_min_usd).toBe(0.19);
    expect(planById("enterprise")?.overage_per_min_usd).toBe(0.17);
  });

  it("keeps price leadership while protecting full-use contribution margin", () => {
    const paid = STRIPE_PLANS.filter((plan) => plan.price_usd_monthly > 0);
    for (const plan of paid) {
      expect(
        estimatedContributionMarginAtFullIncludedUsage(plan, "month"),
        `${plan.id} monthly`,
      ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
    }

    for (const plan of paid) {
      expect(
        estimatedContributionMarginAtFullIncludedUsage(plan, "year"),
        `${plan.id} annual`,
      ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
    }

    expect(planById("starter")?.price_usd_annual).toBe(99);
    expect(
      estimatedContributionMarginAtFullIncludedUsage(planById("starter")!, "year"),
    ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
  });

  it("keeps paid extra-agent add-ons as capacity bundles", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      expect(plan.extra_agent_price_usd, plan.id).toBe(15);
      expect(plan.extra_agent_voice_minutes_monthly, plan.id).toBe(50);
      expect(plan.extra_agent_included_phone_numbers, plan.id).toBe(1);
    }
  });

  it("keeps env price id fallback for launch catalog entries", () => {
    process.env.STRIPE_TEAM_PRICE_ID = "price_env_business";

    expect(planByPriceId("price_env_business")?.id).toBe("business");
    expect(planByStripePrice({ id: "price_env_business" })?.id).toBe("business");
  });

  it("resolves from canonical Stripe price metadata before env ids", () => {
    process.env.STRIPE_TEAM_PRICE_ID = "price_same_id_but_env_business";

    expect(
      planByStripePrice({
        id: "price_same_id_but_env_business",
        metadata: { wireline_plan_id: "team" },
      })?.id,
    ).toBe("team");
  });

  it("resolves launch price keys when plan id metadata is absent", () => {
    expect(
      planByStripePrice({
        id: "price_not_in_env",
        metadata: { wireline_price_key: "business_monthly_founder_2026_07_v2" },
      })?.id,
    ).toBe("business");

    expect(
      planByStripePrice({
        id: "price_not_in_env",
        metadata: { wireline_price_key: "team_annual_founder_2026_07_v5" },
      })?.id,
    ).toBe("team");
  });

  it("uses lookup keys as a compatibility fallback", () => {
    expect(planByStripePrice({ lookup_key: "team_monthly_founder_2026_07_v5" })?.id).toBe("team");
  });

  it("treats Starter Plus and above as founder personal+business pair capacity", async () => {
    const { supportsFounderAgentPair } = await import("./plan-catalog");
    expect(supportsFounderAgentPair("starter")).toBe(false);
    expect(supportsFounderAgentPair("team")).toBe(true);
    expect(supportsFounderAgentPair("business")).toBe(true);
    expect(supportsFounderAgentPair("personal")).toBe(false);
  });

  it("documents extra-agent prices as add-ons, not standalone base-plan purchases", () => {
    // The shared add-on price is intentionally present on paid plan objects so
    // UIs can display it and billing code can match Stripe subscription items.
    // Subscription sync identifies the base plan from the base price item only.
    expect(EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID).toBe("price_1Tv9K58e6If87QKm7rzn3MNS");
    expect(STRIPE_PLANS.filter((plan) => plan.extraAgentFallbackPriceId)).toHaveLength(4);
  });

  it("ignores non-plan catalog entries instead of fabricating entitlements", () => {
    expect(
      planByStripePrice({
        id: "price_balance_topup",
        metadata: { wireline_price_key: "balance_25" },
      }),
    ).toBeNull();

    expect(
      planByStripePrice({
        id: "price_unknown",
        metadata: { wireline_plan_id: "not-a-plan", wireline_price_key: "unknown_monthly" },
      }),
    ).toBeNull();
  });
});
