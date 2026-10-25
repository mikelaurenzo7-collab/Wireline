import { describe, expect, it } from "vitest";
import { subscriptionPlanToTier } from "../src/lib/plan-entitlements";
import { resolveProfile } from "../src/lib/tenant-quotas";

describe("usage subscription call admission profile", () => {
  it("admits funded usage calls without inheriting the free account zero-minute gate", () => {
    const profile = resolveProfile(subscriptionPlanToTier("usage"), [], "usage");
    expect(profile.voice_minutes_daily).toBeGreaterThanOrEqual(60);
    expect(profile.voice_minutes_daily).toBeLessThanOrEqual(1_000);
    expect(profile.concurrent_dials).toBe(resolveProfile("personal", []).concurrent_dials);
    expect(subscriptionPlanToTier("unknown-plan")).toBe("free");
    expect(resolveProfile("free", [], "unknown-plan").voice_minutes_daily).toBe(0);
  });

  it("retains an operator's explicit pause even on a funded usage plan", () => {
    const profile = resolveProfile(
      subscriptionPlanToTier("usage"),
      [
        {
          user_id: "review-user",
          dimension: "voice_minutes_daily",
          enabled: true,
          value: 0,
        },
      ],
      "usage",
    );
    expect(profile.voice_minutes_daily).toBe(0);
  });
});
