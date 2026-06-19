import { describe, expect, it } from "vitest";
import { STRIPE_PLANS, planById, VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

describe("plan-catalog", () => {
  it("keeps personal tiers at the lowered consumer price points", () => {
    expect(planById("personal")?.price_usd_monthly).toBe(9);
    expect(planById("personal-plus")?.price_usd_monthly).toBe(19);
    expect(planById("personal")?.voice_minutes_monthly).toBe(30);
    expect(planById("personal-plus")?.voice_minutes_monthly).toBe(100);
  });

  it("keeps business starter at $99 with 300 minutes", () => {
    const starter = planById("business-starter");
    expect(starter?.price_usd_monthly).toBe(99);
    expect(starter?.voice_minutes_monthly).toBe(300);
    expect(starter?.overage_per_min_usd).toBe(0.2);
  });

  it("exposes five self-serve Stripe plans", () => {
    expect(STRIPE_PLANS).toHaveLength(5);
    expect(STRIPE_PLANS.map((p) => p.id)).toEqual([
      "personal",
      "personal-plus",
      "business-starter",
      "starter",
      "scale",
    ]);
  });

  it("maintains positive margin floor headroom on personal overage", () => {
    const personal = planById("personal");
    expect(personal).not.toBeNull();
    expect(personal!.overage_per_min_usd).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
  });
});
