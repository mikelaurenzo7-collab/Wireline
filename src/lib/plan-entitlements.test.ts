import { describe, expect, it } from "vitest";
import { resetOwnerEmailCacheForTests } from "./auth-service";
import {
  defaultAiSpendBudgetUsdForTier,
  effectivePlanIdForEntitlements,
  openRouterAllowedForEntitlements,
  openRouterAllowedForPlanId,
  openRouterAllowedForTier,
  subscriptionPlanToTier,
  voiceMinutesDailyQuotaForTier,
} from "./plan-entitlements";

describe("plan-entitlements", () => {
  it("maps subscription plans to quota tiers", () => {
    expect(subscriptionPlanToTier("pro")).toBe("pro");
    expect(subscriptionPlanToTier(null)).toBe("free");
  });

  it("gates OpenRouter to Pro and above", () => {
    expect(openRouterAllowedForPlanId("starter")).toBe(false);
    expect(openRouterAllowedForPlanId("pro")).toBe(true);
    expect(openRouterAllowedForPlanId("business")).toBe(true);
    expect(openRouterAllowedForTier("personal")).toBe(false);
  });

  it("grants platform owners enterprise entitlements regardless of subscription row", () => {
    const prev = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = "founder@wireline.com";
    resetOwnerEmailCacheForTests();
    try {
      expect(effectivePlanIdForEntitlements("starter", "founder@wireline.com")).toBe("enterprise");
      expect(openRouterAllowedForEntitlements("starter", "founder@wireline.com")).toBe(true);
      expect(openRouterAllowedForEntitlements("starter", "guest@wireline.com")).toBe(false);
    } finally {
      process.env.OWNER_EMAIL = prev;
      resetOwnerEmailCacheForTests();
    }
  });

  it("derives daily voice caps from monthly catalog", () => {
    const proDaily = voiceMinutesDailyQuotaForTier("pro");
    const starterDaily = voiceMinutesDailyQuotaForTier("starter");
    expect(proDaily).toBeGreaterThan(starterDaily);
    expect(proDaily).toBe(Math.ceil((5000 / 30) * 3.6));
  });

  it("assigns default AI spend budgets by tier", () => {
    expect(defaultAiSpendBudgetUsdForTier("personal")).toBe(15);
    expect(defaultAiSpendBudgetUsdForTier("pro")).toBe(75);
    expect(defaultAiSpendBudgetUsdForTier("enterprise")).toBe(500);
  });
});
