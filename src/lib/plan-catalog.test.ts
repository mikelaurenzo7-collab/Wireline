import { describe, expect, it } from "vitest";
import { STRIPE_PLANS, planById, VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

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
});
