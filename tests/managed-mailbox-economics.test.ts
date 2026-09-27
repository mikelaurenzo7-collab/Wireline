import { describe, expect, it } from "vitest";
import {
  MANAGED_MAILBOX_COST_MONTHLY_USD,
  PAYMENT_PROCESSING_FIXED_USD,
  STRIPE_PLANS,
  estimatedExtraAgentMonthlyCosts,
  estimatedPlanMonthlyCosts,
  estimatedContributionMarginAtFullIncludedUsage,
  estimatedContributionMarginAtExpectedUsage,
  planById,
} from "../src/lib/plan-catalog";
import { computePlanFullUtilizationMarginPct } from "../src/lib/tenant-economics";

describe("managed mailbox capacity economics", () => {
  it("allocates zero managed mailboxes to the free private draft", () => {
    const free = planById("personal")!;
    expect(free.max_agents).toBe(1);
    expect(estimatedPlanMonthlyCosts(free, "month").mailboxesUsd).toBe(0);
  });

  it.each(STRIPE_PLANS.filter((plan) => plan.price_usd_monthly > 0))(
    "reserves every promised $id mailbox even at zero or expected use",
    (plan) => {
      expect(MANAGED_MAILBOX_COST_MONTHLY_USD).toBe(2);
      for (const interval of ["month", "year"] as const) {
        for (const utilization of [0, 0.7, 1]) {
          const costs = estimatedPlanMonthlyCosts(plan, interval, { utilization });
          expect(costs.mailboxesUsd).toBe(plan.included_mailboxes * 2);
          expect(costs.numbersUsd).toBeCloseTo(plan.included_phone_numbers * 1.15, 8);
          if (utilization === 0) {
            expect(costs.voiceUsd + costs.runtimeUsd + costs.managedAiUsd).toBe(0);
            expect(costs.totalCostUsd).toBeCloseTo(
              costs.numbersUsd +
                costs.mailboxesUsd +
                costs.commercialFeesUsd +
                costs.completionGraceUsd,
              8,
            );
          }
        }
      }
    },
  );

  it("spreads the one annual fixed payment fee across twelve months", () => {
    const plan = { ...planById("starter")!, price_usd_monthly: 25, price_usd_annual: 300 };
    const month = estimatedPlanMonthlyCosts(plan, "month");
    const annual = estimatedPlanMonthlyCosts(plan, "year");
    expect(month.revenueUsd).toBe(annual.revenueUsd);
    expect(annual.commercialFeesUsd).toBeCloseTo((300 * 0.041) / 12 + 0.3 / 12, 8);
    expect(month.commercialFeesUsd - annual.commercialFeesUsd).toBeCloseTo((0.3 * 11) / 12, 8);
    expect(month.mailboxesUsd).toBe(annual.mailboxesUsd);
  });

  it("reserves the entire bounded unpaid call independently of normal utilization", () => {
    for (const id of ["voice", "voice-email", "voice-sms", "omnichannel"]) {
      for (const utilization of [0, 0.7, 1]) {
        expect(
          estimatedPlanMonthlyCosts(planById(id)!, "year", { utilization }).completionGraceUsd,
        ).toBe(1.28);
        expect(
          estimatedPlanMonthlyCosts(planById(id)!, "year", {
            utilization,
            voiceCostPerMinuteUsd: 0.14,
          }).completionGraceUsd,
        ).toBeCloseTo(1.4, 8);
      }
    }
    expect(estimatedPlanMonthlyCosts(planById("email")!, "month").completionGraceUsd).toBe(0);
    expect(estimatedPlanMonthlyCosts(planById("starter")!, "month").completionGraceUsd).toBe(0);
  });

  it("keeps full and expected margin consumers on the same complete breakdown", () => {
    for (const plan of STRIPE_PLANS.filter((item) => item.price_usd_monthly > 0)) {
      for (const interval of ["month", "year"] as const) {
        const full = estimatedPlanMonthlyCosts(plan, interval);
        const expected = estimatedPlanMonthlyCosts(plan, interval, { utilization: 0.7 });
        const fullRatio = (full.revenueUsd - full.totalCostUsd) / full.revenueUsd;
        expect(estimatedContributionMarginAtFullIncludedUsage(plan, interval)).toBeCloseTo(
          fullRatio,
          8,
        );
        expect(computePlanFullUtilizationMarginPct(plan, interval)).toBe(
          Math.round(fullRatio * 1000) / 10,
        );
        expect(estimatedContributionMarginAtExpectedUsage(plan, interval)).toBeCloseTo(
          (expected.revenueUsd - expected.totalCostUsd) / expected.revenueUsd,
          8,
        );
      }
    }
  });

  it("includes one mailbox per extra Bot and distinguishes a separate payment fee", () => {
    const plan = planById("starter")!;
    const grouped = estimatedExtraAgentMonthlyCosts(plan);
    const separate = estimatedExtraAgentMonthlyCosts(plan, { separatePayment: true });
    const expected = estimatedExtraAgentMonthlyCosts(plan, { utilization: 0.7 });
    expect(grouped.mailboxesUsd).toBe(2);
    expect(expected.mailboxesUsd).toBe(2);
    expect(grouped.numbersUsd).toBe(1.15);
    expect(grouped.voiceUsd).toBe(6.4);
    expect(grouped.totalCostUsd - grouped.commercialFeesUsd).toBeCloseTo(9.55, 8);
    expect(separate.totalCostUsd - grouped.totalCostUsd).toBeCloseTo(
      PAYMENT_PROCESSING_FIXED_USD,
      8,
    );
    expect(estimatedExtraAgentMonthlyCosts(planById("personal")!).totalCostUsd).toBe(0);
  });
});
