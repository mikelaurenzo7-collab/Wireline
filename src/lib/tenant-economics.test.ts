import { describe, expect, it } from "vitest";
import {
  assertPlanMarginFloors,
  computeGrossMarginPct,
  MARGIN_AT_RISK_THRESHOLD_PCT,
} from "./tenant-economics";
import { VOICE_VARIABLE_COST_PER_MIN_USD } from "./plan-catalog";

describe("tenant-economics", () => {
  it("computes gross margin from revenue and COGS", () => {
    expect(computeGrossMarginPct(0.2, VOICE_VARIABLE_COST_PER_MIN_USD)).toBeCloseTo(36, 0);
    expect(computeGrossMarginPct(0.128, VOICE_VARIABLE_COST_PER_MIN_USD)).toBe(0);
  });

  it("flags at-risk threshold constant", () => {
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBe(10);
  });

  it("plan catalog margin floors pass for current tiers", () => {
    const result = assertPlanMarginFloors();
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
