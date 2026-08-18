import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_INCLUDED_UTILIZATION,
  EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
  EXTRA_AGENT_ADDON_PHONE_NUMBERS,
  EXTRA_AGENT_ADDON_PRICE_ENV,
  EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY,
  EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY,
  FLAT_OVERAGE_PER_MIN_USD,
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  STRIPE_PLANS,
  estimatedContributionMarginAtExpectedUsage,
  estimatedContributionMarginAtFullIncludedUsage,
} from "../src/lib/plan-catalog";
import { planEconomics } from "../src/lib/plan-economics";
import { COGS_DRIFT_THRESHOLD_PER_MIN_USD, MARGIN_AT_RISK_THRESHOLD_PCT, assertPlanMarginFloors } from "../src/lib/tenant-economics";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const USAGE_GUARD_STRIP = [
  "src/pages/Pricing.tsx",
  "src/pages/BillingSettings.tsx",
  "server/call-start.ts",
  "server/routes/payments.ts",
  "server/telephony/call-credit.ts",
  "server/telephony/call-summary.ts",
  "server/telephony/twiml-helpers.ts",
  "server/telephony/outbound-intelligence.ts",
  "server/telephony/outbound-call.ts",
  "server/telephony/voice-runtime.ts",
  "server/elevenlabs/runtime-metering.ts",
  "server/runtime-metering.ts",
  "server/stripe-runtime-prices.ts",
  "server/wallet-runtime-billing.ts",
  "server/wallet.ts",
] as const;

describe("plan economics contract", () => {
  it("keeps one production-number entitlement per live Bot coherent", () => {
    for (const plan of STRIPE_PLANS) {
      if (plan.id === "personal") {
        expect(plan.included_phone_numbers).toBe(0);
        continue;
      }
      expect(plan.included_phone_numbers).toBe(plan.max_agents);
      expect(plan.extra_agent_price_usd).toBe(EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY);
      expect(plan.extra_agent_voice_minutes_monthly).toBe(EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY);
      expect(plan.extra_agent_included_phone_numbers).toBe(EXTRA_AGENT_ADDON_PHONE_NUMBERS);
      expect(plan.extraAgentPriceIdEnv).toBe(EXTRA_AGENT_ADDON_PRICE_ENV);
      expect(plan.extraAgentFallbackPriceId).toBe(EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID);
    }
  });

  it("keeps live voice tied to Runtime Balance economics", () => {
    for (const plan of STRIPE_PLANS) {
      const economics = planEconomics(plan.id);
      expect(economics?.voiceMinutesMonthly).toBe(plan.voice_minutes_monthly);
      expect(economics?.overagePerMinuteUsd).toBe(FLAT_OVERAGE_PER_MIN_USD);
      expect(economics?.includedPhoneNumbers).toBe(plan.included_phone_numbers);
    }
  });

  it("holds expected and full-utilization contribution floors", () => {
    expect(EXPECTED_INCLUDED_UTILIZATION).toBeGreaterThan(0);
    expect(LAUNCH_CONTRIBUTION_MARGIN_FLOOR).toBeGreaterThan(HARD_CONTRIBUTION_MARGIN_FLOOR);
    for (const plan of STRIPE_PLANS) {
      if (plan.price_usd_monthly <= 0) continue;
      expect(estimatedContributionMarginAtExpectedUsage(plan, "month")).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
      expect(estimatedContributionMarginAtFullIncludedUsage(plan, "month")).toBeGreaterThanOrEqual(HARD_CONTRIBUTION_MARGIN_FLOOR);
      if (plan.price_usd_annual > 0) expect(estimatedContributionMarginAtFullIncludedUsage(plan, "year")).toBeGreaterThanOrEqual(HARD_CONTRIBUTION_MARGIN_FLOOR);
    }
    expect(assertPlanMarginFloors()).toEqual({ ok: true, violations: [] });
  });

  it("keeps current margin telemetry thresholds explicit", () => {
    expect(COGS_DRIFT_THRESHOLD_PER_MIN_USD).toBeGreaterThan(0);
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBeGreaterThan(0);
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBeLessThan(100);
  });

  it("does not reintroduce retired per-minute caps or postpaid-overage language", () => {
    const retired = /retired_max_call_seconds_per_usage_minute|MAX_CALL_SECONDS_PER_USAGE_MINUTE|postpaid voice-overage/i;
    for (const path of USAGE_GUARD_STRIP) expect(read(path), path).not.toMatch(retired);
  });
});
