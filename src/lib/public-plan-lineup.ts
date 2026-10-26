/**
 * The public plan lineup, derived from the plan catalog so the home page,
 * /pricing, Compare and the 404 hints always quote the same names and prices.
 * SMS packages exist in the catalog but are not sold yet, so they stay out.
 */
import { STRIPE_PLANS, type StripePlan } from "./plan-catalog";
import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "./usage-billing-catalog";

function launchPlan(plan: StripePlan): boolean {
  return (
    plan.catalogFamily === "channels" && plan.public === true && !plan.channels.includes("sms")
  );
}

function requirePlan(id: string): StripePlan {
  const plan = STRIPE_PLANS.find((candidate) => candidate.id === id);
  if (!plan || !launchPlan(plan)) throw new Error(`Missing public plan: ${id}`);
  return plan;
}

export const PERSONAL_PLAN = requirePlan("personal");

/** Calls, Email and Calls + Email in Starter, Plus and Pro capacity. */
export const PUBLIC_CHANNEL_PLANS: readonly StripePlan[] = STRIPE_PLANS.filter(
  (plan) => launchPlan(plan) && plan.id !== PERSONAL_PLAN.id,
);

/** The entry (Starter) package of each channel family, cheapest first. */
export const PUBLIC_ENTRY_PLANS = {
  email: requirePlan("email"),
  calls: requirePlan("voice"),
  callsAndEmail: requirePlan("voice-email"),
} as const;

/** Home page cards: Personal plus the entry package of each channel family. */
export const HOME_PLAN_IDS = ["personal", "email", "voice", "voice-email"] as const;

/** e.g. "Lite $12/mo · Starter $24/mo · Plus $49/mo" */
export function publicPriceSummary(): string {
  return PUBLIC_USAGE_TIERS.map(
    (id) => `${USAGE_TIERS[id].name} $${USAGE_TIERS[id].monthlyUsd}/mo`,
  ).join(" · ");
}

/** Short hint for tight spaces, e.g. "Lite $12 · Starter $24 · Plus $49" */
export function publicPriceHint(): string {
  return PUBLIC_USAGE_TIERS.map(
    (id) => `${USAGE_TIERS[id].name} $${USAGE_TIERS[id].monthlyUsd}`,
  ).join(" · ");
}
