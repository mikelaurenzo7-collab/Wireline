import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  STRIPE_PLANS,
  estimatedContributionMarginAtExpectedUsage,
  estimatedContributionMarginAtFullIncludedUsage,
  estimatedStripeCommercialFeesUsd,
  planById,
} from "../src/lib/plan-catalog";
import {
  COGS_DRIFT_THRESHOLD_PER_MIN_USD,
  assertPlanMarginFloors,
  computePlanFullUtilizationMarginPct,
} from "../src/lib/tenant-economics";
import { BUSINESS_TOOL_NAMES } from "../src/lib/agent-capabilities";
import { resolveCreateEnabledTools } from "../src/lib/agent-create-defaults";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("catalog v6 capacity stays inside the two-floor margin guardrail", () => {
  it("ships the v6 founder voice allowances", () => {
    expect(planById("starter")?.voice_minutes_monthly).toBe(60);
    expect(planById("team")?.voice_minutes_monthly).toBe(120);
    expect(planById("business")?.voice_minutes_monthly).toBe(245);
    expect(planById("enterprise")?.voice_minutes_monthly).toBe(450);
  });

  it("keeps every plan above both floors on both intervals", () => {
    // docs/PRICING_DECISION_2026-07-25.md: planning floor at expected
    // utilization, hard floor at 100% utilization; annual is always binding.
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
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
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      for (const interval of ["month", "year"] as const) {
        const revenue = interval === "year" ? plan.price_usd_annual / 12 : plan.price_usd_monthly;
        const commercialFees =
          interval === "year"
            ? estimatedStripeCommercialFeesUsd(plan.price_usd_annual) / 12
            : estimatedStripeCommercialFeesUsd(plan.price_usd_monthly);
        const bindingCogsPerMin =
          (revenue * (1 - HARD_CONTRIBUTION_MARGIN_FLOOR) -
            plan.included_phone_numbers * 1.15 -
            plan.runtime_allowance_usd_monthly -
            commercialFees) /
          plan.voice_minutes_monthly;
        expect(
          COGS_DRIFT_THRESHOLD_PER_MIN_USD,
          `${plan.id} ${interval} floor binds at ${bindingCogsPerMin.toFixed(4)}/min`,
        ).toBeLessThanOrEqual(bindingCogsPerMin);
      }
    }
  });

  it("survives a COGS drift to the pricing-review threshold without going underwater", () => {
    // Bigger included allowances raise exposure to per-minute cost drift. At
    // the alarm rate every paid plan must keep expected-usage contribution at
    // or above 40% and worst-case full-use contribution at or above 25% on
    // the binding annual interval, or v6 was sized with no room for its cost
    // basis to move.
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      const revenue = plan.price_usd_annual / 12;
      const commercialFees = estimatedStripeCommercialFeesUsd(plan.price_usd_annual) / 12;
      const fullCost =
        plan.voice_minutes_monthly * COGS_DRIFT_THRESHOLD_PER_MIN_USD +
        plan.included_phone_numbers * 1.15 +
        plan.runtime_allowance_usd_monthly +
        commercialFees;
      const expectedCost =
        plan.voice_minutes_monthly * 0.7 * COGS_DRIFT_THRESHOLD_PER_MIN_USD +
        plan.included_phone_numbers * 1.15 +
        plan.runtime_allowance_usd_monthly * 0.7 +
        commercialFees;
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
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      const monthly = computePlanFullUtilizationMarginPct(plan, "month")!;
      const annual = computePlanFullUtilizationMarginPct(plan, "year")!;
      expect(annual, `${plan.id}`).toBeLessThanOrEqual(monthly);
    }

    const economics = read("src/lib/tenant-economics.ts");
    expect(economics).toContain('for (const interval of ["month", "year"] as const)');
    expect(assertPlanMarginFloors().ok).toBe(true);
  });

  it("keeps the Stripe founder manifest metadata in step with the catalog", () => {
    const manifest = read("scripts/lib/stripe-founder-catalog.mjs");
    for (const [planId, minutes] of [
      ["starter", 60],
      ["team", 120],
      ["business", 245],
      ["enterprise", 450],
    ] as const) {
      expect(manifest).toContain(
        `wireline_plan_id: "${planId}", included_voice_minutes: "${minutes}"`,
      );
    }
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
