/**
 * Single source for Stripe-backed plan tiers: agent caps (voice-number slots
 * match the same cap), pricing surface, voice-minute caps + overage rate,
 * and price-id → plan resolution at runtime.
 *
 * Unit economics: variable cost per voice minute lands around $0.13
 * (Vapi infra + 11labs synthesis + Claude reasoning + Twilio per-call).
 * Plan limits + overage rates are tuned so every tier stays cash-positive
 * at full utilization. Pricing.tsx renders the same numbers; keep them
 * in sync.
 */

export type StripePlanId = "personal" | "starter" | "pro" | "enterprise";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  /** Pooled monthly voice minutes across all agents in the workspace. */
  voice_minutes_monthly: number;
  /** Per-minute overage rate when monthly cap is exceeded. */
  overage_per_min_usd: number;
  features: string[];
  /** Env var holding the Stripe price_… id for this tier. */
  priceIdEnv: string;
};

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Personal",
    price_usd_monthly: 29,
    max_agents: 1,
    voice_minutes_monthly: 100,
    overage_per_min_usd: 0.25,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    features: [
      "1 AI voice agent (voice + email)",
      "One dedicated Wireline voice number",
      "100 voice minutes / month",
      "Unlimited inbound email",
      "Call logs + transcripts + sentiment",
      "Overage billed at $0.25 / min",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 99,
    max_agents: 3,
    voice_minutes_monthly: 500,
    overage_per_min_usd: 0.2,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    features: [
      "3 AI agents (voice + email)",
      "Dedicated voice number per agent",
      "500 voice minutes / month",
      "Outbound dialer (CSV + auto-dial)",
      "Live call monitor + sentiment",
      "Up to 5 team seats",
      "Overage billed at $0.20 / min",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 399,
    max_agents: 10,
    voice_minutes_monthly: 2_500,
    overage_per_min_usd: 0.18,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: [
      "10 AI agents (voice + email)",
      "Dedicated voice number per agent",
      "2,500 voice minutes / month",
      "Outbound dialer + email campaigns",
      "Slack alerts on key events",
      "Up to 25 team seats",
      "Webhook + Action Engine",
      "Overage billed at $0.18 / min",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 0, // contact sales
    max_agents: 100,
    voice_minutes_monthly: 50_000,
    overage_per_min_usd: 0.15,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "Up to 100 agents (custom bundles)",
      "Dedicated voice numbers + BYO carrier option",
      "50,000 voice minutes (custom volume)",
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
    voice_minutes_monthly: p.voice_minutes_monthly,
    overage_per_min_usd: p.overage_per_min_usd,
    features: p.features,
    configured: !!process.env[p.priceIdEnv],
  }));
}
