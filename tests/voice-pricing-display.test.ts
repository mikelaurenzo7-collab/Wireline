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

  it("estimates minutes from Conversation Balance", () => {
    expect(estimateVoiceMinutesFromBalance(50, 0.18)).toBe(277);
    expect(estimateVoiceMinutesFromBalance(10, 0.18)).toBe(55);
    expect(estimateVoiceMinutesFromBalance(0, 0.18)).toBe(0);
  });
});
