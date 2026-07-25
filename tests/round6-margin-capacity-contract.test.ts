import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  STRIPE_PLANS,
  estimatedContributionMarginAtFullIncludedUsage,
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

describe("round-6 capacity raise stays inside the margin guardrail", () => {
  it("ships the raised founder voice allowances", () => {
    expect(planById("starter")?.voice_minutes_monthly).toBe(20);
    expect(planById("team")?.voice_minutes_monthly).toBe(55);
    expect(planById("business")?.voice_minutes_monthly).toBe(120);
    expect(planById("enterprise")?.voice_minutes_monthly).toBe(285);
  });

  it("keeps every raised plan above the contribution floor on both intervals", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      for (const interval of ["month", "year"] as const) {
        expect(
          estimatedContributionMarginAtFullIncludedUsage(plan, interval),
          `${plan.id} ${interval}`,
        ).toBeGreaterThanOrEqual(LAUNCH_CONTRIBUTION_MARGIN_FLOOR);
      }
    }
  });

  it("survives a COGS drift to the pricing-review threshold without going underwater", () => {
    // Raising included minutes raises exposure to per-minute cost drift. Every
    // paid plan must still clear 40% contribution at the drift alarm rate, or
    // the raise was sized off a cost basis with no room to move.
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      const revenue = plan.price_usd_annual / 12;
      const cost =
        plan.voice_minutes_monthly * COGS_DRIFT_THRESHOLD_PER_MIN_USD +
        plan.included_phone_numbers * 1.15 +
        plan.runtime_allowance_usd_monthly +
        (plan.price_usd_annual * 0.029 + 0.3) / 12;
      expect((revenue - cost) / revenue, `${plan.id} at drift`).toBeGreaterThanOrEqual(0.4);
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
      ["starter", 20],
      ["team", 55],
      ["business", 120],
      ["enterprise", 285],
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
