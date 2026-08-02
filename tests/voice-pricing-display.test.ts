import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateVoiceMinutesFromBalance,
  publishedVoiceRates,
  voiceRateForPlan,
} from "../src/lib/voice-pricing-display";

describe("voice-pricing-display", () => {
  it("publishes balance and paid-tier overage rates for every paid plan", () => {
    const rates = publishedVoiceRates();
    expect(rates.map((row) => row.planId)).toEqual(["starter", "team", "business", "enterprise"]);
    expect(rates[0]?.rateUsd).toBe(voiceRateForPlan("starter"));
    expect(rates.every((row) => row.rateUsd === voiceRateForPlan("starter"))).toBe(true);
  });

  it("keeps the public pricing page's published rate derived from the catalog", () => {
    // The /pricing page now states the flat prepaid rate; it must interpolate
    // the catalog constant, never a hardcoded dollar string that can drift.
    const pricing = readFileSync(resolve(process.cwd(), "src/pages/Pricing.tsx"), "utf8");
    expect(pricing).toContain("FLAT_OVERAGE_PER_MIN_USD");
    expect(pricing).toContain("TOPUP_RATE");
    expect(pricing).not.toContain('"$0.22');
  });

  it("estimates minutes from Runtime Balance at the catalog Starter rate", () => {
    const rate = voiceRateForPlan("starter");
    expect(rate).toBe(0.22);
    expect(estimateVoiceMinutesFromBalance(50, rate)).toBe(227);
    expect(estimateVoiceMinutesFromBalance(10, rate)).toBe(45);
    expect(estimateVoiceMinutesFromBalance(0, rate)).toBe(0);
    expect(estimateVoiceMinutesFromBalance(50)).toBe(227);
  });
});
