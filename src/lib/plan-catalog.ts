/**
 * Single source for Stripe-backed plan tiers: agent caps (voice-number slots
 * match the same cap), pricing surface, voice-minute caps + overage rate,
 * and price-id → plan resolution at runtime.
 *
 * PRICING PHILOSOPHY (Mike's call): lower the front-door price enough to remove
 * trial friction, then keep the minute pools disciplined so every self-serve tier
 * can still make money at realistic usage. No free trial: customers start on a
 * paid plan, test with live demos first, and upgrade as volume proves out.
 *
 * UNIT ECONOMICS: Variable cost per voice minute lands around $0.128
 * (Vapi $0.06 + 11labs $0.014 + Claude voice-mode $0.04 + Twilio $0.014).
 * We protect gross margin by pairing lower subscription prices with smaller,
 * honest included-minute pools and positive-margin overage rates.
 *
 * LAUNCH RESET (June 2026):
 *   personal:    $19/mo  — 100 min/month, $0.24/min overage, $19/addon
 *   starter:     $89/mo  — 500 min/month, $0.22/min overage, $25/addon
 *   pro:         $299/mo — 1,500 min/month, $0.19/min overage, $29/addon
 *   business:    $899/mo — 5,000 min/month, $0.16/min overage, $25/addon
 *   enterprise:  Custom pricing — contracts cover committed volume + SLA margin
 *
 * Existing subscribers stay on their original Stripe Price IDs (Stripe
 * grandfathers automatically) — only new signups see the new rates.
 * Pricing.tsx renders these same numbers; keep in sync.
 */

/** Documented variable COGS per voice minute — used by voice reliability dashboard. */
export const VOICE_VARIABLE_COST_PER_MIN_USD = 0.128;

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
  /**
   * Annual price = monthly × 12 × 0.80 (20% discount for yearly commitment).
   * 0 for Enterprise (contact sales).
   */
  price_usd_annual: number;
  /** Env var holding the Stripe price_… id for the annual billing interval. */
  annualPriceIdEnv: string;
  /**
   * Metered price for voice-minute overage (monthly interval, tied to
   * STRIPE_VOICE_OVERAGE_METER_EVENT_NAME). Attached as a second checkout
   * line item so Stripe invoices overage automatically.
   */
  overagePriceIdEnv?: string;
};

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: "personal",
    name: "Personal",
    price_usd_monthly: 19,
    max_agents: 1,
    voice_minutes_monthly: 100,
    overage_per_min_usd: 0.24,
    included_phone_numbers: 1,
    priceIdEnv: "STRIPE_PERSONAL_PRICE_ID",
    extra_agent_price_usd: 19,
    extraAgentPriceIdEnv: "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 180,
    annualPriceIdEnv: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PERSONAL_OVERAGE_PRICE_ID",
    features: [
      "1 AI voice agent (voice + email)",
      "Dedicated voice number INCLUDED — no Twilio bill",
      "100 voice minutes / month for light personal coverage",
      "Unlimited inbound email",
      "All integrations included (Slack, Teams, HubSpot, DocuSign, Sheets, more)",
      "Call logs + transcripts + sentiment",
      "Overage billed at $0.24 / min",
      "Add more agents: $19/each/month",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 89,
    max_agents: 3,
    voice_minutes_monthly: 500,
    overage_per_min_usd: 0.22,
    included_phone_numbers: 3,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    extra_agent_price_usd: 25,
    extraAgentPriceIdEnv: "STRIPE_STARTER_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 850,
    annualPriceIdEnv: "STRIPE_STARTER_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_STARTER_OVERAGE_PRICE_ID",
    features: [
      "3 AI agents (voice + email)",
      "3 dedicated voice numbers INCLUDED — one per agent, no Twilio bill",
      "500 voice minutes / month",
      "Outbound dialer (CSV + auto-dial)",
      "Live call monitor + sentiment",
      "All integrations included (Slack, Teams, HubSpot, DocuSign, Sheets, more)",
      "Up to 5 team seats",
      "Overage billed at $0.22 / min",
      "Add more agents: $25/each/month",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 299,
    max_agents: 10,
    voice_minutes_monthly: 1_500,
    overage_per_min_usd: 0.19,
    included_phone_numbers: 10,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    extra_agent_price_usd: 29,
    extraAgentPriceIdEnv: "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 2_870,
    annualPriceIdEnv: "STRIPE_PRO_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_PRO_OVERAGE_PRICE_ID",
    features: [
      "10 AI agents (voice + email)",
      "10 dedicated voice numbers INCLUDED — one per agent, no Twilio bill",
      "1,500 voice minutes / month",
      "Outbound dialer + email campaigns",
      "All integrations included (Slack, Teams, HubSpot, DocuSign, Sheets, more)",
      "Up to 25 team seats",
      "Webhook + Action Engine",
      "AI voice cloning + custom personalities",
      "Post-call coaching + agent training",
      "Overage billed at $0.19 / min",
      "Priority support",
      "Add more agents: $29/each/month",
    ],
  },
  {
    id: "business",
    name: "Business",
    price_usd_monthly: 899,
    max_agents: 25,
    voice_minutes_monthly: 5_000,
    overage_per_min_usd: 0.16,
    included_phone_numbers: 25,
    priceIdEnv: "STRIPE_BUSINESS_PRICE_ID",
    extra_agent_price_usd: 25,
    extraAgentPriceIdEnv: "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
    price_usd_annual: 8_630,
    annualPriceIdEnv: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
    overagePriceIdEnv: "STRIPE_BUSINESS_OVERAGE_PRICE_ID",
    features: [
      "25 AI agents (voice + email)",
      "25 dedicated voice numbers INCLUDED — one per agent, no Twilio bill",
      "5,000 voice minutes / month",
      "Everything in Pro",
      "SSO + audit log export",
      "Up to 50 team seats",
      "Dedicated success manager",
      "Priority support · Slack channel",
      "Overage billed at $0.16 / min",
      "Add more agents: $25/each/month (best per-agent rate)",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 0, // contact sales
    max_agents: 100,
    voice_minutes_monthly: 50_000,
    overage_per_min_usd: 0.13,
    included_phone_numbers: 100,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    price_usd_annual: 0,
    annualPriceIdEnv: "STRIPE_ENTERPRISE_ANNUAL_PRICE_ID",
    features: [
      "Up to 100 agents (custom bundles)",
      "100 numbers INCLUDED — one per agent + BYO carrier option",
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
  return (
    STRIPE_PLANS.find(
      (p) => process.env[p.priceIdEnv] === priceId || process.env[p.annualPriceIdEnv] === priceId,
    ) || null
  );
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
      price_usd_annual: p.price_usd_annual,
      max_agents: p.max_agents,
      voice_minutes_monthly: p.voice_minutes_monthly,
      overage_per_min_usd: p.overage_per_min_usd,
      included_phone_numbers: p.included_phone_numbers,
      features: p.features,
      configured: !contactSales && !!process.env[p.priceIdEnv],
      annual_configured: !contactSales && !!process.env[p.annualPriceIdEnv],
      contact_sales: contactSales,
    };
  });
}
