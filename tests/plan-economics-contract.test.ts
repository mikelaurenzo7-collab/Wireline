import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
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
  TENANT_OBSERVED_COGS_HEADROOM_RATIO,
  estimatedContributionMarginAtExpectedUsage,
  estimatedContributionMarginAtFullIncludedUsage,
} from "../src/lib/plan-catalog";
import { planEconomics } from "../src/lib/plan-economics";
import {
  COGS_DRIFT_THRESHOLD_PER_MIN_USD,
  MARGIN_AT_RISK_THRESHOLD_PCT,
  assertPlanMarginFloors,
} from "../src/lib/tenant-economics";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const productionSources = () =>
  globSync("src/**/*.{ts,tsx}", {
    cwd: process.cwd(),
    nodir: true,
    ignore: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
  });

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("plan economics contract", () => {
  it("keeps one production-number entitlement per live Bot coherent", () => {
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

  it("keeps live voice and flexible allowances tied to the canonical catalog", () => {
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

  it("holds expected-use and full-utilization contribution floors on monthly and annual plans", () => {
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

    expect(assertPlanMarginFloors()).toEqual({ ok: true, violations: [] });
  });

  it("keeps current margin telemetry thresholds explicit and conservative", () => {
    expect(COGS_DRIFT_THRESHOLD_PER_MIN_USD).toBeGreaterThan(0);
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBeGreaterThan(0);
    expect(MARGIN_AT_RISK_THRESHOLD_PCT).toBeLessThan(100);
    expect(TENANT_OBSERVED_COGS_HEADROOM_RATIO).toBeGreaterThan(1);
  });

  it("does not reintroduce retired per-minute caps or postpaid-overage behavior", () => {
    const retired =
      /retired_max_call_seconds_per_usage_minute|MAX_CALL_SECONDS_PER_USAGE_MINUTE|postpaid voice-overage/i;
    const violations = productionSources().filter((path) => retired.test(withoutComments(read(path))));
    expect(violations).toEqual([]);
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
