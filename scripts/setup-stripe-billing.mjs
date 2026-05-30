#!/usr/bin/env node
/**
 * Idempotent Stripe catalog bootstrap for Wireline plan tiers.
 *
 * Creates (or reuses via lookup_key):
 *   - Billing meter: voice_minutes_overage
 *   - Monthly + annual + extra-agent licensed prices
 *   - Per-tier metered voice-overage prices
 *
 * Usage:
 *   $env:STRIPE_SECRET_KEY = "sk_live_..."
 *   node scripts/setup-stripe-billing.mjs
 *
 * Outputs JSON mapping env var names → price IDs for Vercel sync.
 */

import Stripe from "stripe";

const API_VERSION = "2026-04-22.dahlia";
const METER_EVENT_NAME = "voice_minutes_overage";

const TIERS = [
  {
    id: "personal",
    name: "Personal",
    monthly: 4900,
    annual: 47000,
    extraAgent: 4900,
    overagePerMinCents: 20,
  },
  {
    id: "starter",
    name: "Starter",
    monthly: 14900,
    annual: 143000,
    extraAgent: 4500,
    overagePerMinCents: 18,
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 49900,
    annual: 479000,
    extraAgent: 4000,
    overagePerMinCents: 15,
  },
  {
    id: "business",
    name: "Business",
    monthly: 149900,
    annual: 1439000,
    extraAgent: 3500,
    overagePerMinCents: 14,
  },
];

const ENV_MAP = {
  monthly: (tier) => `STRIPE_${tier.toUpperCase()}_PRICE_ID`,
  annual: (tier) => `STRIPE_${tier.toUpperCase()}_ANNUAL_PRICE_ID`,
  extra_agent: (tier) => `STRIPE_${tier.toUpperCase()}_EXTRA_AGENT_PRICE_ID`,
  overage: (tier) => `STRIPE_${tier.toUpperCase()}_OVERAGE_PRICE_ID`,
};

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) {
  console.error("Set STRIPE_SECRET_KEY before running this script.");
  process.exit(1);
}

const stripe = new Stripe(secret, { apiVersion: API_VERSION });

async function priceByLookupKey(lookupKey) {
  const list = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
    active: true,
  });
  return list.data[0] ?? null;
}

async function ensureMeter(eventName) {
  const list = await stripe.billing.meters.list({ limit: 100 });
  const existing = list.data.find((m) => m.event_name === eventName);
  if (existing) {
    console.log(`  ✓ reuse meter ${eventName} → ${existing.id}`);
    return existing;
  }

  const created = await stripe.billing.meters.create({
    display_name: "Voice Minutes Overage",
    event_name: eventName,
    default_aggregation: { formula: "sum" },
    customer_mapping: {
      type: "by_id",
      event_payload_key: "stripe_customer_id",
    },
    value_settings: {
      event_payload_key: "value",
    },
  });
  console.log(`  + create meter ${eventName} → ${created.id}`);
  return created;
}

async function ensureLicensedPrice({
  lookupKey,
  tier,
  priceType,
  unitAmount,
  productId,
  productName,
  interval,
}) {
  const existing = await priceByLookupKey(lookupKey);
  if (existing) {
    console.log(`  ✓ reuse ${lookupKey} → ${existing.id}`);
    return existing;
  }

  const body = {
    currency: "usd",
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname: `${productName} — ${priceType.replace(/_/g, " ")}`,
    metadata: {
      wireline_tier: tier,
      wireline_price_type: priceType,
    },
    recurring: {
      interval,
      usage_type: "licensed",
    },
  };

  if (productId) {
    body.product = productId;
  } else {
    body.product_data = {
      name: `Wireline ${productName}`,
      metadata: {
        wireline_tier: tier,
        wireline_price_type: priceType,
      },
    };
  }

  const created = await stripe.prices.create(body);
  console.log(`  + create ${lookupKey} → ${created.id}`);
  return created;
}

async function ensureOveragePrice({ lookupKey, tier, unitAmountCents, meterId, productId, productName }) {
  const existing = await priceByLookupKey(lookupKey);
  if (existing) {
    console.log(`  ✓ reuse ${lookupKey} → ${existing.id}`);
    return existing;
  }

  const created = await stripe.prices.create({
    currency: "usd",
    unit_amount: unitAmountCents,
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname: `${productName} — voice overage ($${(unitAmountCents / 100).toFixed(2)}/min)`,
    product: productId,
    metadata: {
      wireline_tier: tier,
      wireline_price_type: "voice_overage",
    },
    recurring: {
      interval: "month",
      usage_type: "metered",
      meter: meterId,
    },
  });
  console.log(`  + create ${lookupKey} → ${created.id}`);
  return created;
}

async function main() {
  const envOut = {
    STRIPE_VOICE_OVERAGE_METER_EVENT_NAME: METER_EVENT_NAME,
  };

  console.log(`Wireline Stripe billing setup (API ${API_VERSION})\n`);

  console.log("Billing meter");
  const meter = await ensureMeter(METER_EVENT_NAME);

  for (const tier of TIERS) {
    console.log(`\n${tier.name} (${tier.id})`);
    const monthly = await ensureLicensedPrice({
      lookupKey: `wireline_${tier.id}_monthly`,
      tier: tier.id,
      priceType: "monthly",
      unitAmount: tier.monthly,
      productName: tier.name,
      interval: "month",
    });

    const annual = await ensureLicensedPrice({
      lookupKey: `wireline_${tier.id}_annual`,
      tier: tier.id,
      priceType: "annual",
      unitAmount: tier.annual,
      productId: monthly.product,
      productName: tier.name,
      interval: "year",
    });

    const extra = await ensureLicensedPrice({
      lookupKey: `wireline_${tier.id}_extra_agent`,
      tier: tier.id,
      priceType: "extra_agent",
      unitAmount: tier.extraAgent,
      productId: monthly.product,
      productName: tier.name,
      interval: "month",
    });

    const overage = await ensureOveragePrice({
      lookupKey: `wireline_${tier.id}_voice_overage`,
      tier: tier.id,
      unitAmountCents: tier.overagePerMinCents,
      meterId: meter.id,
      productId: monthly.product,
      productName: tier.name,
    });

    envOut[ENV_MAP.monthly(tier.id)] = monthly.id;
    envOut[ENV_MAP.annual(tier.id)] = annual.id;
    envOut[ENV_MAP.extra_agent(tier.id)] = extra.id;
    envOut[ENV_MAP.overage(tier.id)] = overage.id;
  }

  console.log("\n--- Stripe env mapping (copy to Vercel) ---\n");
  console.log(JSON.stringify(envOut, null, 2));
  console.log("\nEnterprise is contact-sales — leave STRIPE_ENTERPRISE_* empty.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
