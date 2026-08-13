/**
 * Founder economics truth report — derived from the live catalog, never typed.
 *
 * Prints the certified, reachable worst case per paid plan and interval:
 * voice + numbers + Runtime Allowance + independently metered AI allowance +
 * Stripe commercial fees. Every amount is derived from production source.
 *
 * Run: npm run economics:report
 */
import {
  PHONE_NUMBER_COST_MONTHLY_USD,
  STRIPE_PLANS,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  estimatedStripeCommercialFeesUsd,
} from "../src/lib/plan-catalog.ts";
import {
  defaultAiSpendBudgetUsdForTier,
  subscriptionPlanToTier,
} from "../src/lib/plan-entitlements.ts";
import { COGS_DRIFT_THRESHOLD_PER_MIN_USD } from "../src/lib/tenant-economics.ts";

type Interval = "month" | "year";

const money = (value: number) => `$${value.toFixed(2)}`;
const perMin = (value: number) => `$${value.toFixed(3)}`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function monthlyRevenue(plan: (typeof STRIPE_PLANS)[number], interval: Interval): number {
  return interval === "year" ? plan.price_usd_annual / 12 : plan.price_usd_monthly;
}

function monthlyFees(plan: (typeof STRIPE_PLANS)[number], interval: Interval): number {
  return interval === "year"
    ? estimatedStripeCommercialFeesUsd(plan.price_usd_annual) / 12
    : estimatedStripeCommercialFeesUsd(plan.price_usd_monthly);
}

function aiBudget(plan: (typeof STRIPE_PLANS)[number]): number {
  return defaultAiSpendBudgetUsdForTier(subscriptionPlanToTier(plan.id));
}

const paidPlans = STRIPE_PLANS.filter((plan) => plan.price_usd_monthly > 0);

console.log("Wireline plan economics — derived from src/lib/plan-catalog.ts");
console.log(
  `reserve ${perMin(VOICE_VARIABLE_COST_PER_MIN_USD)}/min · number ${money(PHONE_NUMBER_COST_MONTHLY_USD)}/mo · drift alarm ${perMin(COGS_DRIFT_THRESHOLD_PER_MIN_USD)}/min · certified floor ${pct(HARD_CONTRIBUTION_MARGIN_FLOOR)}`,
);
console.log("");

const header = [
  "plan".padEnd(11),
  "int".padEnd(6),
  "rev/mo".padStart(8),
  "runtime".padStart(9),
  "ai budget".padStart(10),
  "full margin".padStart(11),
  "floor@".padStart(8),
].join("  ");
console.log(header);
console.log("-".repeat(header.length));

let anyFloorViolation = false;
for (const plan of paidPlans) {
  for (const interval of ["month", "year"] as const) {
    const revenue = monthlyRevenue(plan, interval);
    const fees = monthlyFees(plan, interval);
    const budget = aiBudget(plan);
    const fullUseCost =
      plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD +
      plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD +
      plan.runtime_allowance_usd_monthly +
      budget +
      fees;
    const fullUseMargin = (revenue - fullUseCost) / revenue;
    if (fullUseMargin < HARD_CONTRIBUTION_MARGIN_FLOOR) anyFloorViolation = true;
    const floorBindingCogs =
      (revenue * (1 - HARD_CONTRIBUTION_MARGIN_FLOOR) -
        plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD -
        plan.runtime_allowance_usd_monthly -
        budget -
        fees) /
      plan.voice_minutes_monthly;

    console.log(
      [
        plan.id.padEnd(11),
        interval.padEnd(6),
        money(revenue).padStart(8),
        money(plan.runtime_allowance_usd_monthly).padStart(9),
        money(budget).padStart(10),
        pct(fullUseMargin).padStart(11),
        `${perMin(floorBindingCogs)}/m`.padStart(9),
      ].join("  "),
    );
  }
}

console.log("");
console.log(
  "full margin reserves every included voice minute, number slot, Runtime Allowance",
);
console.log("dollar, AI allowance dollar, and Stripe commercial fee in the same month.");
if (anyFloorViolation) {
  console.log("");
  console.log("FAIL: at least one reachable full-use plan-interval is below the hard floor.");
  process.exitCode = 1;
} else {
  console.log("");
  console.log("PASS: every reachable full-use plan-interval clears the hard floor.");
}
