import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  STRIPE_PLANS,
  estimatedContributionMarginAtExpectedUsage,
  estimatedContributionMarginAtFullIncludedUsage,
  estimatedPlanMonthlyCosts,
  planById,
} from "../src/lib/plan-catalog";
import {
  COGS_DRIFT_THRESHOLD_PER_MIN_USD,
  assertPlanMarginFloors,
  computePlanFullUtilizationMarginPct,
} from "../src/lib/tenant-economics";
import { BUSINESS_TOOL_NAMES } from "../src/lib/agent-capabilities";
import { resolveCreateEnabledTools } from "../src/lib/agent-create-defaults";
import { VOICE_COMPLETION_GRACE_MINUTES } from "../src/lib/voice-funding-policy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("catalog v6 capacity stays inside the two-floor margin guardrail", () => {
  it("ships the launch-safe founder voice and AI allowances", () => {
    expect(planById("starter")?.voice_minutes_monthly).toBe(50);
    expect(planById("team")?.voice_minutes_monthly).toBe(100);
    expect(planById("business")?.voice_minutes_monthly).toBe(190);
    expect(planById("enterprise")?.voice_minutes_monthly).toBe(350);
    expect(planById("starter")?.ai_spend_allowance_usd_monthly).toBe(1.5);
    expect(planById("team")?.ai_spend_allowance_usd_monthly).toBe(3);
    expect(planById("business")?.ai_spend_allowance_usd_monthly).toBe(6);
    expect(planById("enterprise")?.ai_spend_allowance_usd_monthly).toBe(12);
  });

  it("keeps every plan above both floors on both intervals", () => {
    // docs/PRICING_DECISION_2026-07-25.md: planning floor at expected
    // utilization, hard floor at 100% utilization; annual is always binding.
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      for (const interval of ["month", "year"] as const) {
        expect(
          estimatedContributionMarginAtExpectedUsage(plan, interval),
          `${plan.id} ${interval} expected-usage`,
        ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
        expect(
          estimatedContributionMarginAtFullIncludedUsage(plan, interval),
          `${plan.id} ${interval} full-use`,
        ).toBeGreaterThanOrEqual(HARD_CONTRIBUTION_MARGIN_FLOOR);
      }
    }
  });

  it("alarms before any plan-interval breaches the certified hard floor", () => {
    // The drift alarm must fire while assertPlanMarginFloors still holds.
    // Solve the full-utilization margin for the hard floor on both intervals
    // of every paid plan; the alarm threshold may not sit above the tightest
    // binding COGS/min, or the launch-certified 30% floor is already broken
    // by the time operations hears about drift.
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      for (const interval of ["month", "year"] as const) {
        const costs = estimatedPlanMonthlyCosts(plan, interval);
        const revenue = costs.revenueUsd;
        const bindingCogsPerMin =
          (revenue * (1 - HARD_CONTRIBUTION_MARGIN_FLOOR) -
            (costs.totalCostUsd - costs.voiceUsd - costs.completionGraceUsd)) /
          (plan.voice_minutes_monthly +
            (plan.channels.includes("voice") ? VOICE_COMPLETION_GRACE_MINUTES : 0));
        expect(
          COGS_DRIFT_THRESHOLD_PER_MIN_USD,
          `${plan.id} ${interval} floor binds at ${bindingCogsPerMin.toFixed(4)}/min`,
        ).toBeLessThanOrEqual(bindingCogsPerMin);
      }
    }
  });

  it("survives a real COGS drift without going underwater", () => {
    // Drift resilience is deliberately parameterized independently of the
    // pricing-review reference (which now equals the modeled reserve, so
    // testing "drift to the reference" would just repeat the baseline floor
    // check above). v6 must absorb roughly a 9% cost-basis move — the old
    // $0.14 stress rate — keeping expected-usage contribution at or above 40%
    // and worst-case full-use contribution at or above 25% on the binding
    // annual interval.
    const DRIFT_STRESS_RATE_PER_MIN_USD = 0.14;
    expect(DRIFT_STRESS_RATE_PER_MIN_USD).toBeGreaterThan(COGS_DRIFT_THRESHOLD_PER_MIN_USD);
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      const revenue = plan.price_usd_annual / 12;
      const fullCost = estimatedPlanMonthlyCosts(plan, "year", {
        voiceCostPerMinuteUsd: DRIFT_STRESS_RATE_PER_MIN_USD,
      }).totalCostUsd;
      const expectedCost = estimatedPlanMonthlyCosts(plan, "year", {
        utilization: 0.7,
        voiceCostPerMinuteUsd: DRIFT_STRESS_RATE_PER_MIN_USD,
      }).totalCostUsd;
      expect(
        (revenue - expectedCost) / revenue,
        `${plan.id} expected at drift`,
      ).toBeGreaterThanOrEqual(0.4);
      expect((revenue - fullCost) / revenue, `${plan.id} full-use at drift`).toBeGreaterThanOrEqual(
        0.25,
      );
    }
  });

  it("guards the annual interval, not just the monthly one", () => {
    // Annual bills at a discount against unchanged monthly COGS, so it is always
    // the tighter side. A monthly-only floor check let annual sink silently.
    for (const plan of STRIPE_PLANS.filter((item) => item.catalogFamily === "channels")) {
      const monthly = computePlanFullUtilizationMarginPct(plan, "month")!;
      const annual = computePlanFullUtilizationMarginPct(plan, "year")!;
      expect(annual, `${plan.id}`).toBeLessThanOrEqual(monthly);
    }

    const economics = read("src/lib/tenant-economics.ts");
    expect(economics).toContain('for (const interval of ["month", "year"] as const)');
    expect(assertPlanMarginFloors().ok).toBe(true);
  });

  it("preserves historical allowances without presenting them as new-sale offers", () => {
    for (const id of ["starter", "team", "business", "enterprise"]) {
      expect(planById(id)?.checkoutAvailability).toBe("legacy_only");
      expect(planById(id)?.public).toBe(false);
    }
    expect(assertPlanMarginFloors().legacyExposure).not.toEqual([]);
  });
});

describe("round-6 workplace-chat tool classification", () => {
  it("treats Teams as a business tool, exactly like Slack", () => {
    expect(BUSINESS_TOOL_NAMES.has("send_slack_notification")).toBe(true);
    expect(BUSINESS_TOOL_NAMES.has("send_teams_message")).toBe(true);
  });

  it("strips both workplace-chat tools from a personal create", () => {
    const personalTools = resolveCreateEnabledTools("personal_assistant", false);
    expect(personalTools).not.toContain("send_slack_notification");
    expect(personalTools).not.toContain("send_teams_message");
    expect(personalTools).toContain("book_appointment");
  });
});
