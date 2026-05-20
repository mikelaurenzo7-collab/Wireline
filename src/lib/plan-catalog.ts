/**
 * Single source for Stripe-backed plan tiers: agent caps (voice-number slots
 * match the same cap), pricing surface, voice-minute caps + overage rate,
 * and price-id → plan resolution at runtime.
 *
 * Pricing philosophy (Mike's call): overages should be RARE, not the default.
 * Each tier ships with ~3x the minutes a typical customer in that segment
 * actually burns per month, so hitting overage is a clear signal to upgrade
 * — not a monthly tax. Overage rates also drop with tier to make the
 * upgrade math obvious.
 *
 * Unit economics: variable cost per voice minute lands around $0.128
 * (Vapi $0.06 + 11labs $0.014 + Claude voice-mode $0.04 + Twilio $0.014).
 *
 * Overage rates set in 2026-05 to keep every tier ABOVE cost on
 * overage minutes (prior rates of $0.12/$0.10/$0.08 on Pro/Business/
 * Enterprise were losing money per overage minute). New schedule:
 *   personal:   $0.20  (+36% margin)  — unchanged
 *   starter:    $0.18  (+29% margin)  — bumped from $0.15
 *   pro:        $0.15  (+15% margin)  — bumped from $0.12
 *   business:   $0.13  (+2%  margin)  — bumped from $0.10
 *   enterprise: $0.11  (~breakeven)   — bumped from $0.08, custom contracts cover
 *
 * Existing subscribers stay on their original Stripe Price IDs (Stripe
 * grandfathers automatically) — only new signups see the new rates.
 * Pricing.tsx renders these same numbers; keep in sync.
 */

export type StripePlanId = "personal" | "starter" | "pro" | "business" | "enterprise";

export type StripePlan = {
  id: StripePlanId;
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  /** Pooled monthly voice minutes across all agents in the workspace. */
  voice_minutes_monthly: number;
  /** Per-minute overage rate when monthly cap is exceeded. */
  overage_per_min_usd: number;
  /**
   * How many Wireline-provisioned voice numbers the tier includes at
   * no extra cost. Auto-provisioned from our Twilio pool on the
   * tenant's first agent creation — they never see a Twilio bill.
   * Phone-number COGS (~$1.15/mo per US local) is baked into the
   * tier price.
   */
  included_phone_numbers: number;
  features: string[];
  /** Env var holding the Stripe price_… id for this tier. */
  priceIdEnv: string;
  /**
   * Per-agent overage pricing. Operators who exceed max_agents can
   * purchase additional agents as a subscription line-item add-on
   * instead of being forced to upgrade to the next tier. This is the
   * "à la carte agents" promise on the Pricing page.
   *
   * USD per extra agent per month.
   */
  extra_agent_price_usd?: number;
  /**
   * Env var holding the Stripe price_… id for the per-agent
   * subscription line item (recurring, monthly). Operator creates this
   * Price in the Stripe dashboard with `recurring: { usage_type: "licensed" }`
   * so Stripe bills `quantity × unit_price` each cycle. Quantity is
   * adjusted via the wireline_extra_agents column on settings.
   */
  extraAgentPriceIdEnv?: string;
};

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Personal",
    price_usd_monthly: 49,
    max_agents: 1,
    voice_minutes_monthly: 400,
    overage_per_min_usd: 0.2,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    extra_agent_price_usd: 39,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
    features: [
      "1 AI voice agent (voice + email)",
      "Dedicated voice number INCLUDED — no Twilio bill",
      "400 voice minutes / month (covers most solo operators)",
      "Unlimited inbound email",
      "Call logs + transcripts + sentiment",
      "Overage billed at $0.20 / min (rare on this volume)",
      "Add more agents: $39/each/month",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 149,
    max_agents: 3,
    voice_minutes_monthly: 1_500,
    overage_per_min_usd: 0.18,
    included_phone_numbers: 2,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    extra_agent_price_usd: 35,
    extraAgentPriceIdEnv: "STRIPE_STARTER_EXTRA_AGENT_PRICE_ID",
    features: [
      "3 AI agents (voice + email)",
      "2 dedicated voice numbers INCLUDED — no Twilio bill",
      "1,500 voice minutes / month",
      "Outbound dialer (CSV + auto-dial)",
      "Live call monitor + sentiment",
      "Up to 5 team seats",
      "Overage billed at $0.18 / min",
      "Add more agents: $35/each/month",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 499,
    max_agents: 10,
    voice_minutes_monthly: 6_000,
    overage_per_min_usd: 0.15,
    included_phone_numbers: 5,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    extra_agent_price_usd: 30,
    extraAgentPriceIdEnv: "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
    features: [
      "10 AI agents (voice + email)",
      "5 dedicated voice numbers INCLUDED — no Twilio bill",
      "6,000 voice minutes / month",
      "Outbound dialer + email campaigns",
      "Slack alerts on key events",
      "Up to 25 team seats",
      "Webhook + Action Engine",
      "Overage billed at $0.15 / min",
      "Priority support",
      "Add more agents: $30/each/month",
    ],
  },
  {
    id: "business",
    name: "Business",
    price_usd_monthly: 1_499,
    max_agents: 25,
    voice_minutes_monthly: 15_000,
    overage_per_min_usd: 0.13,
    included_phone_numbers: 10,
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    extra_agent_price_usd: 25,
    extraAgentPriceIdEnv: "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    features: [
      "25 AI agents (voice + email)",
      "10 dedicated voice numbers INCLUDED — no Twilio bill",
      "15,000 voice minutes / month",
      "Everything in Pro",
      "SSO + audit log export",
      "Up to 50 team seats",
      "Priority support · Slack channel",
      "Overage billed at $0.13 / min",
      "Add more agents: $25/each/month (best per-agent rate)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 0, // contact sales
    max_agents: 100,
    voice_minutes_monthly: 50_000,
    overage_per_min_usd: 0.11,
    included_phone_numbers: 25,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "Up to 100 agents (custom bundles)",
      "25 numbers INCLUDED + BYO carrier option",
      "50,000+ voice minutes (custom volume)",
      "Everything in Business",
      "SAML SSO + advanced compliance",
      "Custom data retention + private model deployment",
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
  return STRIPE_PLANS.map((p) => {
    // price_usd_monthly === 0 is the "contact sales" sentinel for Enterprise.
    // Never expose it as a checkout-able plan even if STRIPE_ENTERPRISE_PRICE_ID
    // is still set from an older paid Enterprise tier — that would let anyone
    // subscribe to Enterprise at $0/mo backed by a real Stripe price.
    const contactSales = p.price_usd_monthly === 0;
    return {
      id: p.id,
      name: p.name,
      price_usd_monthly: p.price_usd_monthly,
      max_agents: p.max_agents,
      voice_minutes_monthly: p.voice_minutes_monthly,
      overage_per_min_usd: p.overage_per_min_usd,
      included_phone_numbers: p.included_phone_numbers,
      features: p.features,
      configured: !contactSales && !!process.env[p.priceIdEnv],
      contact_sales: contactSales,
    };
  });
}
