/**
 * Founder economics truth report — derived from the live catalog, never typed.
 *
 * Prints, per paid plan and billing interval:
 *   1. the certified contribution margin the release gate enforces
 *      (voice + numbers + Runtime Allowance + Stripe fees), and
 *   2. the worst case when the separate account AI budget
 *      (defaultAiSpendBudgetUsdForTier) is ALSO fully consumed — the budget is
 *      metered in a different store than the voice envelope it was sized from,
 *      so today both can be spent in the same month.
 *
 * The report decides nothing. It exists so the one open pricing decision —
 * one shared flexible envelope vs. separately certified budgets — is weighed
 * against exact, current numbers instead of remembered ones.
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

/** Mirrors defaultAiSpendBudgetUsdForTier's paid-tier envelope derivation. */
function aiBudget(plan: (typeof STRIPE_PLANS)[number]): number {
  return (
    Math.ceil(
      (plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD +
        plan.runtime_allowance_usd_monthly) *
        100,
    ) / 100
  );
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
  "certified".padStart(10),
  "ai budget".padStart(10),
  "worst case".padStart(11),
  "floor@".padStart(8),
].join("  ");
console.log(header);
console.log("-".repeat(header.length));

let anyNegative = false;
for (const plan of paidPlans) {
  for (const interval of ["month", "year"] as const) {
    const revenue = monthlyRevenue(plan, interval);
    const fees = monthlyFees(plan, interval);
    const certifiedCost =
      plan.voice_minutes_monthly * VOICE_VARIABLE_COST_PER_MIN_USD +
      plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD +
      plan.runtime_allowance_usd_monthly +
      fees;
    const certifiedMargin = (revenue - certifiedCost) / revenue;
    const budget = aiBudget(plan);
    const worstMargin = (revenue - certifiedCost - budget) / revenue;
    if (worstMargin < 0) anyNegative = true;
    const floorBindingCogs =
      (revenue * (1 - HARD_CONTRIBUTION_MARGIN_FLOOR) -
        plan.included_phone_numbers * PHONE_NUMBER_COST_MONTHLY_USD -
        plan.runtime_allowance_usd_monthly -
        fees) /
      plan.voice_minutes_monthly;

    console.log(
      [
        plan.id.padEnd(11),
        interval.padEnd(6),
        money(revenue).padStart(8),
        pct(certifiedMargin).padStart(10),
        money(budget).padStart(10),
        pct(worstMargin).padStart(11),
        `${perMin(floorBindingCogs)}/m`.padStart(9),
      ].join("  "),
    );
  }
}

console.log("");
console.log(
  "certified = margin the release gate enforces (assumes the AI budget draws from the",
);
console.log(
  "same funded envelope). worst case = both the voice envelope AND the separately",
);
console.log(
  "metered AI budget fully consumed in one month — reachable by a heavy legitimate",
);
console.log("tenant under the current split-meter design.");
if (anyNegative) {
  console.log("");
  console.log(
    "⚠ at least one plan-interval goes contribution-negative at simultaneous max",
  );
  console.log(
    "  utilization. Decide: one shared envelope (AI spend debits the allowance),",
  );
  console.log("  or re-certify the floors with the AI budget included in reserved COGS.");
}
