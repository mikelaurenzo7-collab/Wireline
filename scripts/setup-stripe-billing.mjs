#!/usr/bin/env node
/**
 * Idempotent Stripe catalog bootstrap for Wireline launch plan tiers.
 *
 * Creates (or reuses via launch-v2 lookup_key):
 *   - Billing meter: voice_minutes_overage
 *   - Monthly + annual + extra-agent licensed prices on the existing Wireline products
 *   - Per-tier metered voice-overage prices
 *
 * Usage:
 *   $env:STRIPE_SECRET_KEY = "sk_live_..."
 *   node scripts/setup-stripe-billing.mjs > scripts/.stripe-env.generated.json
 *   node scripts/sync-stripe-env-to-vercel.mjs
 *
 * Outputs JSON mapping env var names → price IDs for Vercel sync.
 */

import Stripe from "stripe";

const API_VERSION = "2026-04-22.dahlia";
const CATALOG_VERSION = "launch_v2";
const METER_EVENT_NAME = "voice_minutes_overage";
const DEFAULT_OPENROUTER_MODEL = "x-ai/grok-4.3";

const TIERS = [
  {
    id: "personal",
    name: "Personal",
    productId: "prod_Ubra4guJCt6bWZ",
    monthly: 900,
    annual: 8600,
    extraAgent: 900,
    overagePerMinCents: 25,
  },
  {
    id: "starter",
    name: "Business Starter",
    productId: "prod_UbraxB8Tgjie5S",
    monthly: 7900,
    annual: 75800,
    extraAgent: 1900,
    overagePerMinCents: 21,
  },
  {
    id: "pro",
    name: "Business Pro",
    productId: "prod_UbraSm3B5C4eT1",
    monthly: 24900,
    annual: 239000,
    extraAgent: 2900,
    overagePerMinCents: 18,
  },
  {
    id: "business",
    name: "Business Scale",
    productId: "prod_UbrauGc4x1nHpX",
    monthly: 69900,
    annual: 671000,
    extraAgent: 3900,
    overagePerMinCents: 16,
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

async function assertProductExists(productId, tierName) {
  try {
    const product = await stripe.products.retrieve(productId);
    if (product.deleted) throw new Error("product is deleted");
    return product;
  } catch (error) {
    throw new Error(
      `Missing Stripe product for ${tierName}: ${productId}. Recreate it in Stripe or update productId in scripts/setup-stripe-billing.mjs. ${error.message}`,
    );
  }
}

async function ensureMeter(eventName) {
  const list = await stripe.billing.meters.list({ limit: 100 });
  const existing = list.data.find((m) => m.event_name === eventName);
  if (existing) {
    console.error(`  ✓ reuse meter ${eventName} → ${existing.id}`);
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
  console.error(`  + create meter ${eventName} → ${created.id}`);
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
    console.error(`  ✓ reuse ${lookupKey} → ${existing.id}`);
    return existing;
  }

  const created = await stripe.prices.create({
    currency: "usd",
    unit_amount: unitAmount,
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname: `${productName} — ${priceType.replace(/_/g, " ")}`,
    product: productId,
    metadata: {
      wireline_tier: tier,
      wireline_price_type: priceType,
      wireline_catalog_version: CATALOG_VERSION,
    },
    recurring: {
      interval,
      usage_type: "licensed",
    },
  });
  console.error(`  + create ${lookupKey} → ${created.id}`);
  return created;
}

async function ensureOveragePrice({ lookupKey, tier, unitAmountCents, meterId, productId, productName }) {
  const existing = await priceByLookupKey(lookupKey);
  if (existing) {
    console.error(`  ✓ reuse ${lookupKey} → ${existing.id}`);
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
      wireline_catalog_version: CATALOG_VERSION,
    },
    recurring: {
      interval: "month",
      usage_type: "metered",
      meter: meterId,
    },
  });
  console.error(`  + create ${lookupKey} → ${created.id}`);
  return created;
}

function lookupKey(tier, priceType) {
  return `wireline_${CATALOG_VERSION}_${tier}_${priceType}`;
}

async function main() {
  const envOut = {
    WIRELINE_ASSISTANT_DEFAULT_OPENROUTER_MODEL: DEFAULT_OPENROUTER_MODEL,
    STRIPE_VOICE_OVERAGE_METER_EVENT_NAME: METER_EVENT_NAME,
  };

  console.error(`Wireline Stripe billing setup (API ${API_VERSION}, ${CATALOG_VERSION})\n`);

  console.error("Billing meter");
  const meter = await ensureMeter(METER_EVENT_NAME);

  for (const tier of TIERS) {
    console.error(`\n${tier.name} (${tier.id})`);
    await assertProductExists(tier.productId, tier.name);

    const monthly = await ensureLicensedPrice({
      lookupKey: lookupKey(tier.id, "monthly"),
      tier: tier.id,
      priceType: "monthly",
      unitAmount: tier.monthly,
      productId: tier.productId,
      productName: tier.name,
      interval: "month",
    });

    const annual = await ensureLicensedPrice({
      lookupKey: lookupKey(tier.id, "annual"),
      tier: tier.id,
      priceType: "annual",
      unitAmount: tier.annual,
      productId: tier.productId,
      productName: tier.name,
      interval: "year",
    });

    const extra = await ensureLicensedPrice({
      lookupKey: lookupKey(tier.id, "extra_agent"),
      tier: tier.id,
      priceType: "extra_agent",
      unitAmount: tier.extraAgent,
      productId: tier.productId,
      productName: tier.name,
      interval: "month",
    });

    const overage = await ensureOveragePrice({
      lookupKey: lookupKey(tier.id, "voice_overage"),
      tier: tier.id,
      unitAmountCents: tier.overagePerMinCents,
      meterId: meter.id,
      productId: tier.productId,
      productName: tier.name,
    });

    envOut[ENV_MAP.monthly(tier.id)] = monthly.id;
    envOut[ENV_MAP.annual(tier.id)] = annual.id;
    envOut[ENV_MAP.extra_agent(tier.id)] = extra.id;
    envOut[ENV_MAP.overage(tier.id)] = overage.id;
  }

  console.log(JSON.stringify(envOut, null, 2));
  console.error("\nEnterprise is contact-sales — leave STRIPE_ENTERPRISE_* empty.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
