/**
 * voice-usage.billing-matrix.test.ts
 * Money-path math for voice-minute overage — must match getVoiceUsageSnapshot
 * and trackVoiceMinutes delta logic in voice-usage.ts.
 */
import { describe, expect, it } from "vitest";
import { planById, type StripePlanId } from "./plan-catalog";

/** Mirrors getVoiceUsageSnapshot overage fields (voice-usage.ts). */
function usageOverageFields(used: number, planId: StripePlanId | null) {
  const plan = planById(planId);
  const included = plan?.voice_minutes_monthly ?? 0;
  const overage = Math.max(0, used - included);
  const rate = plan?.overage_per_min_usd ?? 0;
  return {
    voice_minutes_used: used,
    voice_minutes_included: included,
    voice_minutes_remaining: Math.max(0, included - used),
    overage_minutes: overage,
    overage_per_min_usd: rate,
    overage_cost_usd: Math.round(overage * rate * 100) / 100,
  };
}

/** Mirrors trackVoiceMinutes incremental Stripe meter delta (voice-usage.ts). */
function incrementalOverageMinutes(newUsed: number, previousUsed: number, included: number): number {
  return Math.max(0, newUsed - Math.max(included, previousUsed));
}

describe("voice overage at tier boundaries", () => {
  it.each([
    { plan: "personal" as const, included: 400, rate: 0.2 },
    { plan: "starter" as const, included: 1200, rate: 0.18 },
    { plan: "pro" as const, included: 5000, rate: 0.15 },
    { plan: "business" as const, included: 12000, rate: 0.14 },
  ])("$plan — zero overage at exactly included minutes", ({ plan, included, rate }) => {
    const snap = usageOverageFields(included, plan);
    expect(snap.voice_minutes_remaining).toBe(0);
    expect(snap.overage_minutes).toBe(0);
    expect(snap.overage_cost_usd).toBe(0);
    expect(snap.overage_per_min_usd).toBe(rate);
    expect(planById(plan)?.voice_minutes_monthly).toBe(included);
  });

  it.each([
    { plan: "personal" as const, used: 401, overage: 1, cost: 0.2 },
    { plan: "starter" as const, used: 1201, overage: 1, cost: 0.18 },
    { plan: "pro" as const, used: 5001, overage: 1, cost: 0.15 },
    { plan: "business" as const, used: 12001, overage: 1, cost: 0.14 },
  ])("$plan — first minute over included bills at tier rate", ({ plan, used, overage, cost }) => {
    const snap = usageOverageFields(used, plan);
    expect(snap.overage_minutes).toBe(overage);
    expect(snap.overage_cost_usd).toBe(cost);
  });

  it("personal — one minute below included has full remaining allowance", () => {
    const snap = usageOverageFields(399, "personal");
    expect(snap.overage_minutes).toBe(0);
    expect(snap.voice_minutes_remaining).toBe(1);
  });

  it("large overage cost rounds to two decimal places", () => {
    const snap = usageOverageFields(5400, "pro"); // 400 min × $0.15
    expect(snap.overage_minutes).toBe(400);
    expect(snap.overage_cost_usd).toBe(60);
  });

  it("no plan → zero included, zero rate (unsubscribed operator)", () => {
    const snap = usageOverageFields(500, null);
    expect(snap.voice_minutes_included).toBe(0);
    expect(snap.overage_minutes).toBe(500);
    expect(snap.overage_cost_usd).toBe(0);
  });
});

describe("trackVoiceMinutes incremental overage delta", () => {
  const included = 1200; // starter

  it("emits no delta when call stays within included bucket", () => {
    expect(incrementalOverageMinutes(800, 750, included)).toBe(0);
    expect(incrementalOverageMinutes(1200, 1100, included)).toBe(0);
  });

  it("emits only the minutes that cross the included threshold on first overage call", () => {
    // Was 1190, +15 min call → 1205; only 5 min are overage.
    expect(incrementalOverageMinutes(1205, 1190, included)).toBe(5);
  });

  it("emits full call minutes when already in overage territory", () => {
    expect(incrementalOverageMinutes(1300, 1250, included)).toBe(50);
  });

  it("never under-counts when a single call jumps from under to deep overage", () => {
    expect(incrementalOverageMinutes(1500, 1000, included)).toBe(300);
  });
});
