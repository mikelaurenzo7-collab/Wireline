import { describe, expect, it } from "vitest";
import {
  defaultAiSpendBudgetUsdForTier,
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
