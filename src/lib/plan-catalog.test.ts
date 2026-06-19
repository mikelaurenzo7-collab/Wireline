import { describe, expect, it } from "vitest";
import { STRIPE_PLANS, planById, VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

describe("plan-catalog", () => {
  it("keeps entry plans consumer-priced with more useful minutes", () => {
    expect(planById("personal")?.name).toBe("Everyday");
    expect(planById("personal")?.price_usd_monthly).toBe(7);
    expect(planById("personal")?.voice_minutes_monthly).toBe(60);

    expect(planById("personal-plus")?.name).toBe("Plus");
    expect(planById("personal-plus")?.price_usd_monthly).toBe(15);
    expect(planById("personal-plus")?.voice_minutes_monthly).toBe(180);
  });

  it("uses Studio as the full self-serve agent builder tier", () => {
    const studio = planById("business-starter");
    expect(studio?.name).toBe("Studio");
    expect(studio?.price_usd_monthly).toBe(29);
    expect(studio?.max_agents).toBe(4);
    expect(studio?.voice_minutes_monthly).toBe(500);
    expect(studio?.overage_per_min_usd).toBe(0.16);
  });

  it("keeps the canonical five Stripe plan ids while changing packaging", () => {
    expect(STRIPE_PLANS).toHaveLength(5);
    expect(STRIPE_PLANS.map((p) => p.id)).toEqual([
      "personal",
      "personal-plus",
      "business-starter",
      "starter",
      "scale",
    ]);
  });

  it("makes the highest tier contact-sales instead of another odd fixed bundle", () => {
    const custom = planById("scale");
    expect(custom?.name).toBe("Custom");
    expect(custom?.price_usd_monthly).toBe(0);
    expect(custom?.max_agents).toBeGreaterThanOrEqual(25);
  });

  it("maintains positive margin floor headroom on self-serve overage", () => {
    for (const plan of STRIPE_PLANS.filter((p) => p.price_usd_monthly > 0)) {
      expect(plan.overage_per_min_usd).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
    }
  });
});
