/**
 * The public plan lineup, derived from the plan catalog so the home page,
 * /pricing, Compare and the 404 hints always quote the same names and prices.
 * SMS packages exist in the catalog but are not sold yet, so they stay out.
 */
import { STRIPE_PLANS, type StripePlan } from "./plan-catalog";
import { getPlanDisplayName } from "./plan-display";

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

const usd = (amount: number) => `$${amount.toLocaleString("en-US")}`;

/** e.g. "Personal $12/mo · Calls from $19/mo · Email from $9/mo" */
export function publicPriceSummary(): string {
  return [
    `${getPlanDisplayName(PERSONAL_PLAN)} ${usd(PERSONAL_PLAN.price_usd_monthly)}/mo`,
    `${getPlanDisplayName(PUBLIC_ENTRY_PLANS.calls)} from ${usd(PUBLIC_ENTRY_PLANS.calls.price_usd_monthly)}/mo`,
    `${getPlanDisplayName(PUBLIC_ENTRY_PLANS.email)} from ${usd(PUBLIC_ENTRY_PLANS.email.price_usd_monthly)}/mo`,
  ].join(" · ");
}

/** Short hint for tight spaces, e.g. "Personal $12 · Email from $9 · Calls from $19" */
export function publicPriceHint(): string {
  return [
    `${getPlanDisplayName(PERSONAL_PLAN)} ${usd(PERSONAL_PLAN.price_usd_monthly)}`,
    `${getPlanDisplayName(PUBLIC_ENTRY_PLANS.email)} from ${usd(PUBLIC_ENTRY_PLANS.email.price_usd_monthly)}`,
    `${getPlanDisplayName(PUBLIC_ENTRY_PLANS.calls)} from ${usd(PUBLIC_ENTRY_PLANS.calls.price_usd_monthly)}`,
  ].join(" · ");
}
