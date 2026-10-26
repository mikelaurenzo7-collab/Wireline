import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateVoiceMinutesFromBalance,
  publishedVoiceRates,
  voiceRateForPlan,
} from "../src/lib/voice-pricing-display";

describe("voice-pricing-display", () => {
  it("publishes voice capacity and the prepaid rate only for public Calls packages", () => {
    const rates = publishedVoiceRates();
    expect(rates.map((row) => row.planId)).toEqual([
      "personal",
      "voice",
      "voice-regular",
      "voice-high",
      "voice-email",
      "voice-email-regular",
      "voice-email-high",
      "voice-sms",
      "voice-sms-regular",
      "voice-sms-high",
      "omnichannel",
      "omnichannel-regular",
      "omnichannel-high",
    ]);
    expect(rates.find((row) => row.planId === "personal")).toMatchObject({
      includedMinutes: 20,
      rateUsd: 0.22,
    });
    expect(
      ["voice", "voice-regular", "voice-high"].map(
        (planId) => rates.find((row) => row.planId === planId)?.includedMinutes,
      ),
    ).toEqual([50, 250, 500]);
    expect(rates.every((row) => row.includedMinutes > 0)).toBe(true);
    expect(rates[0]?.rateUsd).toBe(voiceRateForPlan("starter"));
    expect(rates.every((row) => row.rateUsd === voiceRateForPlan("starter"))).toBe(true);
  });

  it("derives the public rate from the catalog", () => {
    const pricing = readFileSync(resolve(process.cwd(), "src/pages/Pricing.tsx"), "utf8");
    expect(pricing).toContain("FLAT_OVERAGE_PER_MIN_USD");
    expect(pricing).toContain("TOPUP_RATE");
    expect(pricing).toContain(
      "Extra minutes are {TOPUP_RATE}, paid from Runtime Balance you add ahead of time.",
    );
    expect(pricing).not.toContain('"$0.22');
    expect(pricing).not.toContain("Lite is $");
  });

  it("estimates minutes at the published rate", () => {
    const rate = voiceRateForPlan("starter");
    expect(rate).toBe(0.22);
    expect(estimateVoiceMinutesFromBalance(50, rate)).toBe(227);
    expect(estimateVoiceMinutesFromBalance(10, rate)).toBe(45);
    expect(estimateVoiceMinutesFromBalance(0, rate)).toBe(0);
    expect(estimateVoiceMinutesFromBalance(50)).toBe(227);
  });
});
