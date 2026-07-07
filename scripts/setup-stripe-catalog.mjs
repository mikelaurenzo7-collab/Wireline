#!/usr/bin/env node
/**
 * Reconcile the live Stripe catalog to Wireline's launch pricing model.
 *
 * Source of truth:
 * - Products: Personal, Team, Business, Enterprise, Conversation Balance.
 * - Templates stay unlocked. Pricing sells operating capacity plus balance.
 * - Personal has no recurring subscription price.
 *
 * Inputs:
 * - STRIPE_SECRET_KEY in the environment, .env.local, or .tmp/vercel-production.env.
 *
 * Outputs:
 * - stripe-catalog-proposal.json: applied audit manifest.
 * - scripts/.stripe-env.generated.json: nonsecret Stripe price IDs for Vercel.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API_VERSION = "2026-02-25.clover";
const CATALOG_VERSION = "2026-06-26.capacity";
const VOICE_OVERAGE_METER_EVENT_NAME = "voice_minutes_overage";
const CATALOG_MANIFEST_PATH = join(ROOT, "stripe-catalog-proposal.json");
const GENERATED_ENV_PATH = join(__dirname, ".stripe-env.generated.json");

const RETIRED_PRODUCT_NAMES = [
  "Wireline Plus",
  "Wireline Household",
  "Wireline Custom",
  "Wireline Concierge",
  "Wireline Everyday",
  "Solo Agent",
  "Office Assistant",
  "Front Desk",
  "Sales & Reception",
  "Custom Enterprise",
];

const CATALOG = [
  {
    key: "personal",
    name: "Wireline Personal",
    description:
      "Create and train one agent, then fund live calls, texts, and follow-up through Conversation Balance.",
    metadata: {
      wireline_plan_id: "personal",
      wireline_offer: "personal",
      wireline_billing_model: "conversation_balance_only",
      wireline_templates: "unlocked",
    },
    prices: [],
  },
  {
    key: "team",
    name: "Wireline Team",
    description:
      "Shared SMB operating capacity for several agents, a shared inbox, routing, core integrations, and Conversation Balance.",
    metadata: {
      wireline_plan_id: "team",
      wireline_billing_model: "capacity_plus_conversation_balance",
      wireline_templates: "unlocked",
    },
    defaultPriceKey: "team_monthly",
    prices: [
      {
        key: "team_monthly",
        nickname: "Wireline Team - Monthly",
        envTarget: "STRIPE_BUSINESS_STARTER_PRICE_ID",
        unitAmount: 2900,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: { wireline_plan_id: "team", wireline_price_type: "base_monthly" },
      },
      {
        key: "team_annual",
        nickname: "Wireline Team - Annual",
        envTarget: "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
        unitAmount: 27800,
        recurring: { interval: "year", usage_type: "licensed" },
        metadata: { wireline_plan_id: "team", wireline_price_type: "base_annual" },
      },
      {
        key: "team_extra_agent",
        nickname: "Wireline Team - Extra Agent",
        envTarget: "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
        unitAmount: 900,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: { wireline_plan_id: "team", wireline_price_type: "extra_agent" },
      },
      {
        key: "team_voice_overage",
        nickname: "Wireline Team - Voice Overage",
        envTarget: "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID",
        unitAmount: 18,
        recurring: {
          interval: "month",
          usage_type: "metered",
        },
        metadata: { wireline_plan_id: "team", wireline_price_type: "voice_overage" },
      },
    ],
  },
  {
    key: "business",
    name: "Wireline Business",
    description:
      "Revenue, support, and front desk operating capacity with approvals, analytics, roles, CRM sync, and pooled Conversation Balance.",
    metadata: {
      wireline_plan_id: "business",
      wireline_billing_model: "capacity_plus_conversation_balance",
      wireline_templates: "unlocked",
    },
    defaultPriceKey: "business_monthly",
    prices: [
      {
        key: "business_monthly",
        nickname: "Wireline Business - Monthly",
        envTarget: "STRIPE_PRO_PRICE_ID",
        unitAmount: 5900,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: { wireline_plan_id: "business", wireline_price_type: "base_monthly" },
      },
      {
        key: "business_annual",
        nickname: "Wireline Business - Annual",
        envTarget: "STRIPE_PRO_ANNUAL_PRICE_ID",
        unitAmount: 56600,
        recurring: { interval: "year", usage_type: "licensed" },
        metadata: { wireline_plan_id: "business", wireline_price_type: "base_annual" },
      },
      {
        key: "business_extra_agent",
        nickname: "Wireline Business - Extra Agent",
        envTarget: "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
        unitAmount: 1200,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: { wireline_plan_id: "business", wireline_price_type: "extra_agent" },
      },
      {
        key: "business_voice_overage",
        nickname: "Wireline Business - Voice Overage",
        envTarget: "STRIPE_PRO_OVERAGE_PRICE_ID",
        unitAmount: 14,
        recurring: {
          interval: "month",
          usage_type: "metered",
        },
        metadata: { wireline_plan_id: "business", wireline_price_type: "voice_overage" },
      },
    ],
  },
  {
    key: "enterprise",
    name: "Wireline Enterprise",
    description:
      "SSO, SCIM, audit, BYO SIP, custom policy, and annual committed usage for governed rollouts.",
    metadata: {
      wireline_plan_id: "enterprise",
      wireline_billing_model: "annual_committed_usage",
      wireline_templates: "unlocked",
    },
    prices: [],
  },
  {
    key: "live_video",
    name: "Wireline Live Video",
    description: "Photoreal presenter streaming add-on for business agents.",
    metadata: {
      wireline_product: "live_video_addon",
      wireline_billing_model: "addon_subscription",
    },
    defaultPriceKey: "live_video_monthly",
    prices: [
      {
        key: "live_video_monthly",
        nickname: "Live Video Add-on - Monthly",
        envTarget: "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
        unitAmount: 1900,
        recurring: { interval: "month", usage_type: "licensed" },
        metadata: {
          wireline_price_type: "live_video_addon",
          wireline_product: "live_video_addon",
        },
      },
    ],
  },
  {
    key: "conversation_balance",
    name: "Conversation Balance",
    description:
      "One-time prepaid balance for live calls, texts, follow-up, and provider-backed work.",
    metadata: {
      wireline_price_type: "conversation_balance",
      wireline_billing_model: "one_time_top_up",
    },
    defaultPriceKey: "balance_25",
    prices: [
      {
        key: "balance_5",
        nickname: "Conversation Balance - $5",
        unitAmount: 500,
        metadata: { wireline_price_type: "conversation_balance_top_up", wireline_amount_usd: "5" },
      },
      {
        key: "balance_10",
        nickname: "Conversation Balance - $10",
        unitAmount: 1000,
        metadata: {
          wireline_price_type: "conversation_balance_top_up",
          wireline_amount_usd: "10",
        },
      },
      {
        key: "balance_25",
        nickname: "Conversation Balance - $25",
        unitAmount: 2500,
        metadata: {
          wireline_price_type: "conversation_balance_top_up",
          wireline_amount_usd: "25",
        },
      },
      {
        key: "balance_50",
        nickname: "Conversation Balance - $50",
        unitAmount: 5000,
        metadata: {
          wireline_price_type: "conversation_balance_top_up",
          wireline_amount_usd: "50",
        },
      },
    ],
  },
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadStripeSecret() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
  for (const path of [join(ROOT, ".env.local"), join(ROOT, ".tmp", "vercel-production.env")]) {
    const parsed = parseEnvFile(path);
    if (parsed.STRIPE_SECRET_KEY) return parsed.STRIPE_SECRET_KEY;
  }
  return "";
}

async function collect(listPromise) {
  const rows = [];
  for await (const row of listPromise) rows.push(row);
  return rows;
}

function productIdOf(price) {
  if (!price?.product) return null;
  return typeof price.product === "string" ? price.product : price.product.id;
}

function metadataWithBase(metadata) {
  return {
    ...metadata,
    wireline_catalog_state: "launch_active",
    wireline_catalog_version: CATALOG_VERSION,
  };
}

function sameRecurring(actual, expected) {
  if (!expected) return !actual;
  return (
    actual?.interval === expected.interval &&
    (actual?.usage_type || "licensed") === (expected.usage_type || "licensed")
  );
}

function priceMatches(price, spec) {
  return (
    price.active &&
    price.currency === "usd" &&
    price.unit_amount === spec.unitAmount &&
    sameRecurring(price.recurring, spec.recurring) &&
    (!spec.meterId || price.recurring?.meter === spec.meterId) &&
    price.metadata?.wireline_price_key === spec.key
  );
}

async function ensureVoiceOverageMeter(stripe) {
  if (!stripe.billing?.meters) {
    throw new Error("Installed Stripe SDK does not expose Billing Meters.");
  }
  const meters = await collect(stripe.billing.meters.list({ limit: 100 }));
  const existing = meters.find(
    (meter) => meter.event_name === VOICE_OVERAGE_METER_EVENT_NAME && meter.status !== "inactive",
  );
  if (existing) return { meter: existing, action: "reused" };

  const meter = await stripe.billing.meters.create({
    display_name: "Wireline voice minutes overage",
    event_name: VOICE_OVERAGE_METER_EVENT_NAME,
    default_aggregation: { formula: "sum" },
    customer_mapping: {
      type: "by_id",
      event_payload_key: "stripe_customer_id",
    },
    value_settings: { event_payload_key: "value" },
  });
  return { meter, action: "created" };
}

async function ensureProduct(stripe, productsByName, spec) {
  const metadata = metadataWithBase(spec.metadata);
  const existing = productsByName.get(spec.name);
  if (!existing) {
    const product = await stripe.products.create({
      name: spec.name,
      description: spec.description,
      active: true,
      metadata,
    });
    productsByName.set(product.name, product);
    return { product, action: "created" };
  }

  const product = await stripe.products.update(existing.id, {
    active: true,
    description: spec.description,
    metadata: {
      ...(existing.metadata || {}),
      ...metadata,
    },
  });
  productsByName.set(product.name, product);
  return { product, action: existing.active ? "updated" : "reactivated" };
}

async function ensurePrice(stripe, product, spec) {
  const allPrices = await collect(stripe.prices.list({ product: product.id, limit: 100 }));
  const existing = allPrices.find((price) => priceMatches(price, spec));
  if (existing) return { price: existing, action: "reused" };

  const metadata = {
    ...spec.metadata,
    wireline_price_key: spec.key,
    wireline_catalog_state: "launch_active",
    wireline_catalog_version: CATALOG_VERSION,
  };
  const params = {
    product: product.id,
    currency: "usd",
    unit_amount: spec.unitAmount,
    nickname: spec.nickname,
    metadata,
  };
  if (spec.recurring) params.recurring = spec.recurring;
  if (spec.meterId) {
    params.recurring = {
      ...params.recurring,
      meter: spec.meterId,
    };
  }

  const price = await stripe.prices.create(params);
  return { price, action: "created" };
}

async function listPaymentLinkProductIds(stripe) {
  const productIds = new Set();
  const paymentLinks = await collect(stripe.paymentLinks.list({ active: true, limit: 100 }));
  for (const link of paymentLinks) {
    const lineItems = await collect(stripe.paymentLinks.listLineItems(link.id, { limit: 100 }));
    for (const item of lineItems) {
      const productId = productIdOf(item.price);
      if (productId) productIds.add(productId);
    }
  }
  return { paymentLinks, productIds };
}

async function listOpenCheckoutProductIds(stripe) {
  const productIds = new Set();
  const sessions = (await collect(stripe.checkout.sessions.list({ limit: 100 }))).filter(
    (session) => session.status === "open",
  );
  for (const session of sessions) {
    const lineItems = await collect(
      stripe.checkout.sessions.listLineItems(session.id, { limit: 100 }),
    );
    for (const item of lineItems) {
      const productId = productIdOf(item.price);
      if (productId) productIds.add(productId);
    }
  }
  return { sessions, productIds };
}

async function listLiveSubscriptionProductIds(stripe) {
  const productIds = new Set();
  const subscriptions = [
    ...(await collect(stripe.subscriptions.list({ status: "active", limit: 100 }))),
    ...(await collect(stripe.subscriptions.list({ status: "trialing", limit: 100 }))),
  ];
  for (const subscription of subscriptions) {
    for (const item of subscription.items?.data || []) {
      const productId = productIdOf(item.price);
      if (productId) productIds.add(productId);
    }
  }
  return { subscriptions, productIds };
}

async function ensureArchivalDefaultPrice(stripe, product) {
  const existing = (
    await collect(stripe.prices.list({ product: product.id, active: true, limit: 100 }))
  ).find((price) => price.metadata?.wireline_catalog_state === "retired_anchor");
  if (existing) {
    if (product.default_price !== existing.id) {
      await stripe.products.update(product.id, { default_price: existing.id });
    }
    return existing.id;
  }
  const anchor = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 0,
    nickname: "Retired catalog anchor",
    metadata: {
      wireline_catalog_state: "retired_anchor",
      wireline_not_for_sale: "true",
    },
  });
  await stripe.products.update(product.id, { default_price: anchor.id });
  return anchor.id;
}

async function archiveRetiredProducts(stripe, productsByName, blockers) {
  const archived = [];
  const warnings = [];

  for (const name of RETIRED_PRODUCT_NAMES) {
    const product = productsByName.get(name);
    if (!product) continue;

    const blockerReasons = [];
    if (blockers.subscriptionProductIds.has(product.id)) blockerReasons.push("live subscription");
    if (blockers.paymentLinkProductIds.has(product.id)) blockerReasons.push("active payment link");
    if (blockers.checkoutProductIds.has(product.id)) blockerReasons.push("open checkout session");
    if (blockerReasons.length) {
      warnings.push(`${name}: skipped archive due to ${blockerReasons.join(", ")}`);
      continue;
    }

    const activePrices = await collect(
      stripe.prices.list({ product: product.id, active: true, limit: 100 }),
    );
    for (const price of activePrices) {
      if (product.default_price === price.id) {
        const anchorId = await ensureArchivalDefaultPrice(stripe, product);
        if (price.id !== anchorId) {
          try {
            await stripe.prices.update(price.id, { active: false });
          } catch (error) {
            warnings.push(`${name}: could not archive default price ${price.id}: ${error.message}`);
          }
        }
        continue;
      }
      try {
        await stripe.prices.update(price.id, { active: false });
      } catch (error) {
        warnings.push(`${name}: could not archive price ${price.id}: ${error.message}`);
      }
    }

    try {
      const updated = await stripe.products.update(product.id, {
        active: false,
        metadata: {
          ...(product.metadata || {}),
          wireline_catalog_state: "retired",
          wireline_retired_by: "wireline_catalog_reconciler",
          wireline_retired_reason: "capacity_catalog_replaced_template_catalog",
          wireline_catalog_version: CATALOG_VERSION,
        },
      });
      productsByName.set(name, updated);
      archived.push({ id: product.id, name });
    } catch (error) {
      warnings.push(`${name}: could not archive product ${product.id}: ${error.message}`);
    }
  }

  return { archived, warnings };
}

async function main() {
  const secret = loadStripeSecret();
  if (!secret) {
    console.error("STRIPE_SECRET_KEY is required. Pull Vercel production env first.");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const account = await stripe.accounts.retrieve();
  const allProductsBefore = await collect(stripe.products.list({ limit: 100 }));
  const productsByName = new Map(allProductsBefore.map((product) => [product.name, product]));

  const [liveSubs, paymentLinks, openCheckout] = await Promise.all([
    listLiveSubscriptionProductIds(stripe),
    listPaymentLinkProductIds(stripe),
    listOpenCheckoutProductIds(stripe),
  ]);

  const env = {};
  const productResults = [];
  const priceResults = [];
  const voiceMeter = await ensureVoiceOverageMeter(stripe);

  for (const productSpec of CATALOG) {
    const ensuredProduct = await ensureProduct(stripe, productsByName, productSpec);
    const product = ensuredProduct.product;
    productResults.push({
      key: productSpec.key,
      id: product.id,
      name: product.name,
      action: ensuredProduct.action,
    });

    const ensuredPrices = {};
    for (const priceSpec of productSpec.prices) {
      const meteredPriceSpec =
        priceSpec.recurring?.usage_type === "metered"
          ? { ...priceSpec, meterId: voiceMeter.meter.id }
          : priceSpec;
      const ensuredPrice = await ensurePrice(stripe, product, meteredPriceSpec);
      ensuredPrices[priceSpec.key] = ensuredPrice.price;
      priceResults.push({
        key: priceSpec.key,
        id: ensuredPrice.price.id,
        product: product.name,
        nickname: ensuredPrice.price.nickname,
        action: ensuredPrice.action,
        env_target: priceSpec.envTarget || null,
      });
      if (priceSpec.envTarget) env[priceSpec.envTarget] = ensuredPrice.price.id;
    }

    const defaultPrice = productSpec.defaultPriceKey
      ? ensuredPrices[productSpec.defaultPriceKey]
      : null;
    if (defaultPrice && product.default_price !== defaultPrice.id) {
      await stripe.products.update(product.id, { default_price: defaultPrice.id });
    }
  }

  const archive = await archiveRetiredProducts(stripe, productsByName, {
    subscriptionProductIds: liveSubs.productIds,
    paymentLinkProductIds: paymentLinks.productIds,
    checkoutProductIds: openCheckout.productIds,
  });

  const allProductsAfter = await collect(stripe.products.list({ limit: 100 }));
  const manifest = {
    generated_at: new Date().toISOString(),
    account_id: account.id,
    status: archive.warnings.length ? "applied_with_archive_warnings" : "applied",
    api_version: API_VERSION,
    audit_snapshot: {
      live_subscriptions: liveSubs.subscriptions.length,
      active_payment_links: paymentLinks.paymentLinks.length,
      open_checkout_sessions: openCheckout.sessions.length,
      active_products_before: allProductsBefore
        .filter((product) => product.active)
        .map((product) => product.name)
        .sort(),
      active_products_after: allProductsAfter
        .filter((product) => product.active)
        .map((product) => product.name)
        .sort(),
    },
    applied_writes: {
      meters: [
        {
          id: voiceMeter.meter.id,
          event_name: voiceMeter.meter.event_name,
          action: voiceMeter.action,
        },
      ],
      products: productResults,
      prices: priceResults,
      archived_products: archive.archived,
      archive_warnings: archive.warnings,
    },
    generated_env: env,
    guardrails: [
      "No Personal recurring subscription price was created.",
      "Templates remain unlocked across products.",
      "Old products were only archived when no live subscription, active payment link, or open checkout dependency was found.",
      "Default prices may remain active under inactive retired products because Stripe blocks default-price archival.",
    ],
  };

  writeFileSync(CATALOG_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(GENERATED_ENV_PATH, `${JSON.stringify(env, null, 2)}\n`);

  console.log(`Stripe catalog reconciled for ${account.id}`);
  console.log(`Wrote ${CATALOG_MANIFEST_PATH}`);
  console.log(`Wrote ${GENERATED_ENV_PATH}`);
  if (archive.warnings.length) {
    console.log("Archive warnings:");
    for (const warning of archive.warnings) console.log(`- ${warning}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
