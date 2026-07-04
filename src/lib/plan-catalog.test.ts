import { afterEach, describe, expect, it } from "vitest";
import {
  STRIPE_PLANS,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  planById,
  planByPriceId,
  planByStripePrice,
} from "./plan-catalog";

const STRIPE_PLAN_ENV_KEYS = [
  "STRIPE_BUSINESS_STARTER_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_PRO_ANNUAL_PRICE_ID",
  "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PRO_OVERAGE_PRICE_ID",
] as const;

afterEach(() => {
  for (const key of STRIPE_PLAN_ENV_KEYS) delete process.env[key];
});

describe("plan-catalog", () => {
  it("keeps Personal hidden behind the Conversation Balance model", () => {
    const personal = planById("personal");
    expect(personal?.name).toBe("Wireline Personal");
    expect(personal?.public).toBe(false);
    expect(personal?.price_usd_monthly).toBe(0);
  });

  it("maps the shared-capacity tiers to Team, Business, and Enterprise", () => {
    expect(planById("business-starter")?.name).toBe("Wireline Team");
    expect(planById("team")?.name).toBe("Wireline Team");
    expect(planById("starter")?.name).toBe("Wireline Business");
    expect(planById("business")?.name).toBe("Wireline Business");
    expect(planById("scale")?.name).toBe("Wireline Enterprise");
    expect(planById("enterprise")?.name).toBe("Wireline Enterprise");
  });

  it("keeps the canonical Stripe plan identifiers aligned to the commercial model", () => {
    expect(STRIPE_PLANS).toHaveLength(4);
    expect(STRIPE_PLANS.map((plan) => plan.id)).toEqual([
      "personal",
      "team",
      "business",
      "enterprise",
    ]);
    expect(planById("personal-plus")?.id).toBe("team");
  });

  it("keeps Enterprise as a contact-sales plan", () => {
    const scale = planById("scale");
    expect(scale?.name).toBe("Wireline Enterprise");
    expect(scale?.price_usd_monthly).toBe(0);
    expect(scale?.max_agents).toBe(999);
  });

  it("keeps paid plans positive and overage above variable voice cost", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      expect(plan.price_usd_monthly).toBeGreaterThan(0);
      expect(plan.overage_per_min_usd).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
    }
  });

  it("keeps env price id fallback for older local catalog entries", () => {
    process.env.STRIPE_PRO_PRICE_ID = "price_env_business";

    expect(planByPriceId("price_env_business")?.id).toBe("business");
    expect(planByStripePrice({ id: "price_env_business" })?.id).toBe("business");
  });

  it("resolves from canonical Stripe price metadata before env ids", () => {
    process.env.STRIPE_PRO_PRICE_ID = "price_same_id_but_env_business";

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
        metadata: { wireline_price_key: "business_voice_overage" },
      })?.id,
    ).toBe("business");

    expect(
      planByStripePrice({
        id: "price_not_in_env",
        metadata: { wireline_price_key: "team_extra_agent" },
      })?.id,
    ).toBe("team");
  });

  it("uses lookup keys as a compatibility fallback", () => {
    expect(planByStripePrice({ lookup_key: "team_monthly" })?.id).toBe("team");
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
