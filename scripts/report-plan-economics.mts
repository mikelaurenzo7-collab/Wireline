/**
 * Founder economics truth report — derived from the live catalog, never typed.
 *
 * Prints the modeled, reachable worst case per paid plan and interval:
 * voice + numbers + managed mailboxes + Runtime Allowance + AI allowance +
 * Stripe commercial fees. Every amount is derived from production source.
 *
 * Run: npm run economics:report
 */
import {
  PHONE_NUMBER_COST_MONTHLY_USD,
  MANAGED_MAILBOX_COST_MONTHLY_USD,
  STRIPE_PLANS,
  VOICE_VARIABLE_COST_PER_MIN_USD,
  HARD_CONTRIBUTION_MARGIN_FLOOR,
  LAUNCH_CONTRIBUTION_MARGIN_FLOOR,
  EXPECTED_INCLUDED_UTILIZATION,
  estimatedPlanMonthlyCosts,
  estimatedExtraAgentMonthlyCosts,
} from "../src/lib/plan-catalog.ts";
import { COGS_DRIFT_THRESHOLD_PER_MIN_USD } from "../src/lib/tenant-economics.ts";
import { VOICE_COMPLETION_GRACE_MINUTES } from "../src/lib/voice-funding-policy.ts";

const money = (value: number) => `$${value.toFixed(2)}`;
const perMin = (value: number) => `$${value.toFixed(3)}`;
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

const paidPlans = STRIPE_PLANS.filter((plan) => plan.price_usd_monthly > 0);
console.log(
  "Legacy plans are read-only historical exposure; only new channel packages determine this release result. SMS packages remain blocked pending carrier/cost readiness.",
);

console.log("BotBound plan economics — derived from src/lib/plan-catalog.ts");
console.log(
  `reserve ${perMin(VOICE_VARIABLE_COST_PER_MIN_USD)}/min · number ${money(PHONE_NUMBER_COST_MONTHLY_USD)}/mo · mailbox ${money(MANAGED_MAILBOX_COST_MONTHLY_USD)}/Bot/mo · drift alarm ${perMin(COGS_DRIFT_THRESHOLD_PER_MIN_USD)}/min`,
);
console.log(
  `Required floors: full ${pct(HARD_CONTRIBUTION_MARGIN_FLOOR)} · expected ${pct(LAUNCH_CONTRIBUTION_MARGIN_FLOOR)}`,
);
console.log("");

const header = [
  "plan".padEnd(11),
  "int".padEnd(6),
  "rev/mo".padStart(8),
  "mail/mo".padStart(8),
  "grace/mo".padStart(8),
  "runtime".padStart(9),
  "ai budget".padStart(10),
  "full margin".padStart(11),
  "expected".padStart(9),
  "floor@".padStart(8),
].join("  ");
console.log(header);
console.log("-".repeat(header.length));

let anyFloorViolation = false;
for (const plan of paidPlans) {
  for (const interval of ["month", "year"] as const) {
    const costs = estimatedPlanMonthlyCosts(plan, interval);
    const expected = estimatedPlanMonthlyCosts(plan, interval, {
      utilization: EXPECTED_INCLUDED_UTILIZATION,
    });
    const revenue = costs.revenueUsd;
    const fullUseMargin = (revenue - costs.totalCostUsd) / revenue;
    const expectedMargin = (revenue - expected.totalCostUsd) / revenue;
    if (
      fullUseMargin < HARD_CONTRIBUTION_MARGIN_FLOOR ||
      expectedMargin < LAUNCH_CONTRIBUTION_MARGIN_FLOOR
    )
      if (plan.catalogFamily !== "legacy") anyFloorViolation = true;
    const floorBindingCogs =
      (revenue * (1 - HARD_CONTRIBUTION_MARGIN_FLOOR) -
        (costs.totalCostUsd - costs.voiceUsd - costs.completionGraceUsd)) /
      (plan.voice_minutes_monthly +
        (plan.catalogFamily === "channels" && plan.channels.includes("voice")
          ? VOICE_COMPLETION_GRACE_MINUTES
          : 0));

    console.log(
      [
        (plan.catalogFamily === "legacy" ? `${plan.id} (legacy)` : plan.id).padEnd(22),
        interval.padEnd(6),
        money(revenue).padStart(8),
        money(costs.mailboxesUsd).padStart(8),
        money(costs.completionGraceUsd).padStart(8),
        money(plan.runtime_allowance_usd_monthly).padStart(9),
        money(costs.managedAiUsd).padStart(10),
        pct(fullUseMargin).padStart(11),
        pct(expectedMargin).padStart(9),
        (plan.voice_minutes_monthly > 0 ? `${perMin(floorBindingCogs)}/m` : "n/a").padStart(9),
      ].join("  "),
    );
  }
}

console.log("");
console.log("Full margin reserves every included voice minute, number, mailbox, Runtime Allowance");
console.log(
  "dollar, AI allowance dollar, Stripe commercial fee, and one full unpaid completion buffer.",
);
console.log(
  "The completion buffer is not utilization-discounted; uncollected debt is not revenue.",
);
console.log(
  "Mailbox allocation is capacity COGS; do not also deduct the full AgentMail invoice in this contribution view.",
);
console.log(
  "Hosting, database, unused/operational capacity, tax variance and other fixed overhead remain company operating costs.",
);
const addonPlan = paidPlans.find((plan) => (plan.extra_agent_price_usd ?? 0) > 0);
if (addonPlan) {
  for (const separatePayment of [false, true]) {
    const full = estimatedExtraAgentMonthlyCosts(addonPlan, { separatePayment });
    const expected = estimatedExtraAgentMonthlyCosts(addonPlan, {
      separatePayment,
      utilization: EXPECTED_INCLUDED_UTILIZATION,
    });
    const fullMargin = (full.revenueUsd - full.totalCostUsd) / full.revenueUsd;
    const expectedMargin = (expected.revenueUsd - expected.totalCostUsd) / expected.revenueUsd;
    console.log(
      `Extra Bot ${separatePayment ? "separate payment" : "grouped invoice"}: ${money(full.revenueUsd)}/mo · mailbox ${money(full.mailboxesUsd)} · full ${pct(fullMargin)} · expected ${pct(expectedMargin)}`,
    );
    if (
      fullMargin < HARD_CONTRIBUTION_MARGIN_FLOOR ||
      expectedMargin < LAUNCH_CONTRIBUTION_MARGIN_FLOOR
    )
      console.log(
        "Legacy add-on exposure: below a required contribution floor; not sold with channel packages.",
      );
  }
  console.log(
    "Add-on proration and annual-parent invoice grouping require actual billing proof; these are full monthly scenarios.",
  );
}
if (anyFloorViolation) {
  console.log("");
  console.log("FAIL: at least one new channel plan scenario is below a required margin floor.");
  process.exitCode = 1;
} else {
  console.log("");
  console.log(
    "PASS: new channel packages clear modeled floors before unresolved SMS readiness costs and company overhead; legacy exposure is reported above.",
  );
}
