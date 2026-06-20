import { describe, expect, it } from "vitest";
import { STRIPE_PLANS, planById, VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

describe("plan-catalog", () => {
  it("keeps Personal light-use and affordable", () => {
    const personal = planById("personal");
    expect(personal?.name).toBe("Personal");
    expect(personal?.price_usd_monthly).toBe(9);
    expect(personal?.voice_minutes_monthly).toBe(30);
    expect(personal?.extra_agent_price_usd).toBe(9);
  });

  it("makes Business Studio the clear operational entry tier", () => {
    const studio = planById("business-starter");
    expect(studio?.name).toBe("Business Studio");
    expect(studio?.price_usd_monthly).toBe(99);
    expect(studio?.max_agents).toBe(2);
    expect(studio?.voice_minutes_monthly).toBe(300);
    expect(studio?.included_phone_numbers).toBe(2);
    expect(studio?.extra_agent_price_usd).toBe(19);
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

  it("keeps Scale as a real self-serve business plan", () => {
    const scale = planById("scale");
    expect(scale?.name).toBe("Business Scale");
    expect(scale?.price_usd_monthly).toBe(699);
    expect(scale?.voice_minutes_monthly).toBe(3_000);
    expect(scale?.max_agents).toBe(10);
  });

  it("reserves positive margin on included voice and overage", () => {
    for (const plan of STRIPE_PLANS.filter((p) => p.price_usd_monthly > 0)) {
      const includedVoiceReserve = plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD;
      expect(plan.price_usd_monthly).toBeGreaterThan(includedVoiceReserve);
      expect(plan.overage_per_min_usd).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
    }
  });
});
