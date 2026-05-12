/**
 * Single source for Stripe-backed plan tiers: agent caps (voice-number slots
 * match the same cap), pricing surface, and price-id → plan resolution at runtime.
 */

export type StripePlanId = "starter" | "pro" | "enterprise";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  features: string[];
  /** Env var holding the Stripe price_… id for this tier. */
  priceIdEnv: string;
};

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 79,
    max_agents: 10,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    features: [
      "10 AI agents (voice + email)",
      "One permanent dedicated Wireline voice number per agent you run (provision in Admin)",
      "Unlimited inbound calls",
      "200 outbound calls / month",
      "Daily Brief + Triage Inbox",
      "Webhooks · Intake API",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 299,
    max_agents: 25,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: [
      "25 AI agents (voice + email)",
      "One permanent dedicated voice number per agent you run",
      "Unlimited outbound calls",
      "Auto-dial new leads instantly",
      "Knowledge Atlas + Insights",
      "Everything in Starter",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 1199,
    max_agents: 100,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "100 AI agents",
      "One permanent dedicated voice number per agent you run · custom bundles available",
      "Everything in Pro",
      "SSO + SAML",
      "Custom data retention",
      "Dedicated success manager",
      "99.95% uptime SLA",
    ],
  },
];

export function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return STRIPE_PLANS.find((p) => process.env[p.priceIdEnv] === priceId) || null;
}

export function planById(id: string | null | undefined): StripePlan | null {
  if (!id) return null;
  return STRIPE_PLANS.find((p) => p.id === id) || null;
}

export function plansForClient() {
  return STRIPE_PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    price_usd_monthly: p.price_usd_monthly,
    max_agents: p.max_agents,
    features: p.features,
    configured: !!process.env[p.priceIdEnv],
  }));
}
