/**
 * voice-usage.billing-matrix.test.ts
 * Money-path math for voice-minute overage — must match getVoiceUsageSnapshot
 * and trackVoiceMinutes delta logic in voice-usage.ts.
 *
 * All boundary values are derived from plan-catalog (the single source of truth
 * for pricing) so this matrix can never drift when the price ladder is retuned.
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
function incrementalOverageMinutes(
  newUsed: number,
  previousUsed: number,
  included: number,
): number {
  return Math.max(0, newUsed - Math.max(included, previousUsed));
}

const PAID_TIERS = (["personal", "starter", "pro", "business"] as const).map((plan) => {
  const p = planById(plan)!;
  return { plan, included: p.voice_minutes_monthly, rate: p.overage_per_min_usd };
});

describe("voice overage at tier boundaries", () => {
  it.each(PAID_TIERS)(
    "$plan — zero overage at exactly included minutes",
    ({ plan, included, rate }) => {
      const snap = usageOverageFields(included, plan);
      expect(snap.voice_minutes_remaining).toBe(0);
      expect(snap.overage_minutes).toBe(0);
      expect(snap.overage_cost_usd).toBe(0);
      expect(snap.overage_per_min_usd).toBe(rate);
      expect(planById(plan)?.voice_minutes_monthly).toBe(included);
    },
  );

  it.each(PAID_TIERS)(
    "$plan — first minute over included bills at tier rate",
    ({ plan, included, rate }) => {
      const snap = usageOverageFields(included + 1, plan);
      expect(snap.overage_minutes).toBe(1);
      expect(snap.overage_cost_usd).toBe(Math.round(rate * 100) / 100);
    },
  );

  it("personal — one minute below included has full remaining allowance", () => {
    const included = planById("personal")!.voice_minutes_monthly;
    const snap = usageOverageFields(included - 1, "personal");
    expect(snap.overage_minutes).toBe(0);
    expect(snap.voice_minutes_remaining).toBe(1);
  });

  it("large overage cost rounds to two decimal places", () => {
    const pro = planById("pro")!;
    const snap = usageOverageFields(pro.voice_minutes_monthly + 400, "pro"); // 400 min over
    expect(snap.overage_minutes).toBe(400);
    expect(snap.overage_cost_usd).toBe(Math.round(400 * pro.overage_per_min_usd * 100) / 100);
  });

  it("no plan → zero included, zero rate (unsubscribed operator)", () => {
    const snap = usageOverageFields(500, null);
    expect(snap.voice_minutes_included).toBe(0);
    expect(snap.overage_minutes).toBe(500);
    expect(snap.overage_cost_usd).toBe(0);
  });
});

describe("trackVoiceMinutes incremental overage delta", () => {
  const included = planById("starter")!.voice_minutes_monthly; // starter

  it("emits no delta when call stays within included bucket", () => {
    expect(incrementalOverageMinutes(included - 100, included - 150, included)).toBe(0);
    expect(incrementalOverageMinutes(included, included - 100, included)).toBe(0);
  });

  it("emits only the minutes that cross the included threshold on first overage call", () => {
    // Was included-10, +15 min call → included+5; only 5 min are overage.
    expect(incrementalOverageMinutes(included + 5, included - 10, included)).toBe(5);
  });

  it("emits full call minutes when already in overage territory", () => {
    expect(incrementalOverageMinutes(included + 100, included + 50, included)).toBe(50);
  });

  it("never under-counts when a single call jumps from under to deep overage", () => {
    expect(incrementalOverageMinutes(included + 300, included - 200, included)).toBe(300);
  });
});
