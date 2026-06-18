import { describe, expect, it } from "vitest";
import { resetOwnerEmailCacheForTests } from "./auth-service";
import { planById } from "./plan-catalog";
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
    expect(subscriptionPlanToTier("pro")).toBe("starter");
    expect(subscriptionPlanToTier("starter")).toBe("starter");
    expect(subscriptionPlanToTier("scale")).toBe("scale");
    expect(subscriptionPlanToTier("business")).toBe("scale");
    expect(subscriptionPlanToTier("enterprise")).toBe("scale");
    expect(subscriptionPlanToTier("business-starter")).toBe("business-starter");
    expect(subscriptionPlanToTier(null)).toBe("free");
  });

  it("gates OpenRouter to starter/scale and above", () => {
    expect(openRouterAllowedForPlanId("business-starter")).toBe(false);
    expect(openRouterAllowedForPlanId("starter")).toBe(true);
    expect(openRouterAllowedForPlanId("pro")).toBe(true);
    expect(openRouterAllowedForPlanId("business")).toBe(true);
    expect(openRouterAllowedForTier("personal")).toBe(false);
    expect(openRouterAllowedForTier("business-starter")).toBe(false);
  });

  it("grants platform owners scale entitlements regardless of subscription row", () => {
    const prev = process.env.OWNER_EMAIL;
    process.env.OWNER_EMAIL = "founder@wireline.com";
    resetOwnerEmailCacheForTests();
    try {
      expect(effectivePlanIdForEntitlements("business-starter", "founder@wireline.com")).toBe(
        "scale",
      );
      expect(openRouterAllowedForEntitlements("business-starter", "founder@wireline.com")).toBe(
        true,
      );
      expect(openRouterAllowedForEntitlements("business-starter", "guest@wireline.com")).toBe(
        false,
      );
    } finally {
      process.env.OWNER_EMAIL = prev;
      resetOwnerEmailCacheForTests();
    }
  });

  it("derives daily voice caps from monthly catalog", () => {
    const starterDaily = voiceMinutesDailyQuotaForTier("starter");
    const businessStarterDaily = voiceMinutesDailyQuotaForTier("business-starter");
    expect(starterDaily).toBeGreaterThan(businessStarterDaily);
    // Mirrors voiceMinutesDailyQuotaForTier: max(10, ceil(monthly/30 * 3.6)).
    const starterMonthly = planById("starter")!.voice_minutes_monthly;
    expect(starterDaily).toBe(Math.max(10, Math.ceil((starterMonthly / 30) * 3.6)));
  });

  it("assigns default AI spend budgets by tier", () => {
    expect(defaultAiSpendBudgetUsdForTier("personal")).toBe(15);
    expect(defaultAiSpendBudgetUsdForTier("personal-plus")).toBe(25);
    expect(defaultAiSpendBudgetUsdForTier("business-starter")).toBe(45);
    expect(defaultAiSpendBudgetUsdForTier("starter")).toBe(75);
    expect(defaultAiSpendBudgetUsdForTier("scale")).toBe(500);
  });
});
