import { describe, expect, it } from "vitest";
import { STRIPE_PLANS, planById, VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

describe("plan-catalog", () => {
  it("keeps Everyday personal-first and affordable", () => {
    const personal = planById("personal");
    expect(personal?.name).toBe("Everyday");
    expect(personal?.price_usd_monthly).toBe(7);
    expect(personal?.voice_minutes_monthly).toBe(60);
    expect(personal?.extra_agent_price_usd).toBe(7);
  });

  it("makes Household the practical multi-assistant tier", () => {
    const household = planById("business-starter");
    expect(household?.name).toBe("Household");
    expect(household?.price_usd_monthly).toBe(29);
    expect(household?.max_agents).toBe(4);
    expect(household?.voice_minutes_monthly).toBe(500);
    expect(household?.included_phone_numbers).toBe(2);
    expect(household?.extra_agent_price_usd).toBe(9);
  });

  it("keeps Concierge as the expanded personal or work tier", () => {
    const concierge = planById("starter");
    expect(concierge?.name).toBe("Concierge");
    expect(concierge?.price_usd_monthly).toBe(59);
    expect(concierge?.max_agents).toBe(8);
  });

  it("keeps the canonical Stripe plan identifiers for subscriptions and migrations", () => {
    expect(STRIPE_PLANS).toHaveLength(5);
    expect(STRIPE_PLANS.map((plan) => plan.id)).toEqual([
      "personal",
      "personal-plus",
      "business-starter",
      "starter",
      "scale",
    ]);
  });

  it("keeps Custom as a contact-sales plan", () => {
    const scale = planById("scale");
    expect(scale?.name).toBe("Custom");
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
