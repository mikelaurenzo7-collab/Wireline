import { describe, expect, it } from "vitest";
import {
  EXPECTED_INCLUDED_UTILIZATION,
  EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID,
  EXTRA_AGENT_ADDON_PRICE_ENV,
  EXTRA_AGENT_ADDON_PHONE_NUMBERS,
  EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY,
  EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY,
  FLAT_OVERAGE_PER_MIN_USD,
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  STRIPE_PLANS,
  TENANT_OBSERVED_COGS_HEADROOM_RATIO,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  estimatedContributionMarginAtExpectedUsage,
  estimatedContributionMarginAtFullIncludedUsage,
} from "../src/lib/plan-catalog";
import { planEconomics } from "../src/lib/plan-economics";
import {
  COGS_DRIFT_THRESHOLD_PER_MIN_USD,
  MARGIN_AT_RISK_THRESHOLD_PCT,
} from "../src/lib/tenant-economics";

const USAGE_GUARD_STRIP = [
  "src/pages/Pricing.tsx",
  "src/pages/BillingSettings.tsx",
  "src/lib/spend-guards.ts",
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
  "tests/wallet-credit-guard.test.ts",
  "tests/plan-economics-contract.test.ts",
] as const;

function read(path: string): string {
  return require("node:fs").readFileSync(require("node:path").resolve(process.cwd(), path), "utf8");
}

describe("plan economics contract", () => {
  it("keeps the one production-number entitlement per live Bot coherent", () => {
    for (const plan of STRIPE_PLANS) {
      if (plan.id === "personal") {
        expect(plan.included_phone_numbers).toBe(0);
        expect(plan.features.join(" ")).not.toMatch(/included Wireline number/i);
        continue;
      }

      expect(plan.included_phone_numbers, plan.id).toBe(plan.max_agents);
      const liveBotFeature = plan.features.find((feature) => /\blive (?:Voice )?Bots?\b/i.test(feature));
      expect(liveBotFeature, plan.id).toBeDefined();
      expect(liveBotFeature, plan.id).toMatch(new RegExp(`\\b${plan.max_agents}\\b`));
      expect(plan.extra_agent_price_usd).toBe(EXTRA_AGENT_ADDON_PRICE_USD_MONTHLY);
      expect(plan.extra_agent_voice_minutes_monthly).toBe(
        EXTRA_AGENT_ADDON_VOICE_MINUTES_MONTHLY,
      );
      expect(plan.extra_agent_included_phone_numbers).toBe(EXTRA_AGENT_ADDON_PHONE_NUMBERS);
      expect(plan.extraAgentPriceIdEnv).toBe(EXTRA_AGENT_ADDON_PRICE_ENV);
      expect(plan.extraAgentFallbackPriceId).toBe(EXTRA_AGENT_ADDON_FALLBACK_PRICE_ID);
      expect(plan.features).toContain(
        "+$15/mo per additional live Bot adds 50 guaranteed voice minutes and 1 number slot",
      );
    }
  });

  it("keeps live-voice limits tied to prepaid Runtime Balance instead of postpaid overages", () => {
    for (const plan of STRIPE_PLANS) {
      const economics = planEconomics(plan.id);
      expect(economics).not.toBeNull();
      expect(economics?.voiceMinutesMonthly).toBe(plan.voice_minutes_monthly);
      expect(economics?.overagePerMinuteUsd).toBe(FLAT_OVERAGE_PER_MIN_USD);
      expect(economics?.includedPhoneNumbers).toBe(plan.included_phone_numbers);
      expect(economics?.runtimeAllowanceUsdMonthly).toBe(plan.runtime_allowance_usd_monthly);
      expect(economics?.aiSpendAllowanceUsdMonthly).toBe(plan.ai_spend_allowance_usd_monthly);
    }
  });

  it("holds both expected-use and full-utilization contribution floors on monthly and annual plans", () => {
    expect(EXPECTED_INCLUDED_UTILIZATION).toBeGreaterThan(0);
    expect(EXPECTED_INCLUDED_UTILIZATION).toBeLessThanOrEqual(1);
    expect(LAUNCH_CONTRIBUTION_MARGIN_FLOOR).toBeGreaterThan(HARD_CONTRIBUTION_MARGIN_FLOOR);

    for (const plan of STRIPE_PLANS) {
      if (plan.price_usd_monthly <= 0) continue;

      expect(
        estimatedContributionMarginAtExpectedUsage(plan, "month"),
        `${plan.id} monthly expected-use margin`,
      ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
      expect(
        estimatedContributionMarginAtFullIncludedUsage(plan, "month"),
        `${plan.id} monthly full-utilization margin`,
      ).toBeGreaterThanOrEqual(HARD_CONTRIBUTION_MARGIN_FLOOR);

      if (plan.price_usd_annual > 0) {
        expect(
          estimatedContributionMarginAtExpectedUsage(plan, "year"),
          `${plan.id} annual expected-use margin`,
        ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
        expect(
          estimatedContributionMarginAtFullIncludedUsage(plan, "year"),
          `${plan.id} annual full-utilization margin`,
        ).toBeGreaterThanOrEqual(HARD_CONTRIBUTION_MARGIN_FLOOR);
      }
    }
  });

  it("keeps alert thresholds tied to the same conservative cost model", () => {
    expect(COGS_DRIFT_THRESHOLD_PER_MIN_USD).toBe(VOICE_VARIABLE_COST_PER_MIN_USD);
    expect(COGS_DRIFT_THRESHOLD_PER_MIN_USD).toBeGreaterThan(0);
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBeGreaterThan(0);
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBeLessThan(100);
    expect(TENANT_OBSERVED_COGS_HEADROOM_RATIO).toBeGreaterThan(1);

    const observedTenantCeiling =
      VOICE_VARIABLE_COST_PER_MIN_USD * TENANT_OBSERVED_COGS_HEADROOM_RATIO;
    expect(observedTenantCeiling).toBeGreaterThan(VOICE_VARIABLE_COST_PER_MIN_USD);
  });

  it("does not reintroduce retired per-minute hard caps or postpaid overage language", () => {
    const retired =
      /retired_max_call_seconds_per_usage_minute|MAX_CALL_SECONDS_PER_USAGE_MINUTE|postpaid voice-overage/i;
    for (const path of USAGE_GUARD_STRIP) {
      expect(read(path), path).not.toMatch(retired);
    }
  });

  it("does not promise unlimited provider-funded usage", () => {
    const publicSurfaces = [
      "src/pages/Pricing.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
      "src/pages/Features.tsx",
    ];
    for (const path of publicSurfaces) {
      expect(read(path), path).not.toMatch(/unlimited (?:calls|messages|usage|voice|sms|email)/i);
    }
  });
});
