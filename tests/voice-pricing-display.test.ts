import { describe, expect, it } from "vitest";
import {
  estimateVoiceMinutesFromBalance,
  publishedVoiceRates,
  voiceRateForPlan,
} from "../src/lib/voice-pricing-display";

describe("voice-pricing-display", () => {
  it("publishes balance and paid-tier overage rates", () => {
    const rates = publishedVoiceRates();
    expect(rates.map((row) => row.planId)).toEqual(["starter", "team", "business"]);
    expect(rates[0]?.rateUsd).toBe(voiceRateForPlan("starter"));
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
