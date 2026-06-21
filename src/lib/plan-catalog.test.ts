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

  it("makes Business Studio the clear operational entry tier", () => {
    const studio = planById("business-starter");
    expect(studio?.name).toBe("Studio");
    expect(studio?.price_usd_monthly).toBe(29);
    expect(studio?.max_agents).toBe(4);
    expect(studio?.voice_minutes_monthly).toBe(500);
    expect(studio?.included_phone_numbers).toBe(2);
    expect(studio?.extra_agent_price_usd).toBe(9);
  });

  it("keeps the canonical Stripe plan identifiers for subscriptions and migrations", () => {
    expect(STRIPE_PLANS).toHaveLength(5);
    expect(STRIPE_PLANS.map((p) => p.id)).toEqual([
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
    for (const plan of STRIPE_PLANS.filter((p) => p.price_usd_monthly > 0)) {
      // Included minutes are an allowance, not a 100%-utilization cost forecast.
      // Stripe is the commercial source of truth; the hard guardrail is that
      // incremental overage never sells below the blended variable cost.
      expect(plan.price_usd_monthly).toBeGreaterThan(0);
      expect(plan.overage_per_min_usd).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
    }
  });
});
