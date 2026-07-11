#!/usr/bin/env node
/**
 * Reconcile Stripe to the Founder Early Access catalog.
 *
 * The free builder is intentionally not a Stripe product. Paid subscriptions
 * guarantee voice capacity; optional provider work uses prepaid Conversation
 * Balance. The reconciler never creates postpaid overage prices.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRICES,
  FOUNDER_PRODUCTS,
  PRODUCT_BY_KEY,
} from "./lib/stripe-founder-catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_VERSION = "2026-02-25.clover";
const CATALOG_MANIFEST_PATH = join(ROOT, "stripe-catalog-proposal.json");
const GENERATED_ENV_PATH = join(ROOT, "scripts", ".stripe-env.generated.json");

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
  if (process.env.STRIPE_SECRET_KEY?.trim()) return process.env.STRIPE_SECRET_KEY.trim();
  for (const path of [join(ROOT, ".env.local"), join(ROOT, ".tmp", "vercel-production.env")]) {
    const parsed = parseEnvFile(path);
    if (parsed.STRIPE_SECRET_KEY) return parsed.STRIPE_SECRET_KEY;
  }
  return "";
}

async function collect(iterator) {
  const rows = [];
  for await (const row of iterator) rows.push(row);
  return rows;
}

function productIdOf(priceOrItem) {
  const price = priceOrItem?.price || priceOrItem;
  if (!price?.product) return null;
  return typeof price.product === "string" ? price.product : price.product.id;
}

function priceIdOf(item) {
  return typeof item?.price === "string" ? item.price : item?.price?.id || item?.id || null;
}

function sameRecurring(actual, expected) {
  if (!expected) return !actual;
  return (
    actual?.interval === expected.interval &&
    (actual?.usage_type || "licensed") === (expected.usage_type || "licensed")
  );
}

async function dependencySnapshot(stripe) {
  const subscriptionPriceIds = new Set();
  const paymentLinkPriceIds = new Set();
  const checkoutPriceIds = new Set();

  const subscriptions = [
    ...(await collect(stripe.subscriptions.list({ status: "active", limit: 100 }))),
    ...(await collect(stripe.subscriptions.list({ status: "trialing", limit: 100 }))),
  ];
  for (const subscription of subscriptions) {
    for (const item of subscription.items?.data || []) {
      const priceId = priceIdOf(item);
      if (priceId) subscriptionPriceIds.add(priceId);
    }
  }

  const paymentLinks = await collect(stripe.paymentLinks.list({ active: true, limit: 100 }));
  for (const link of paymentLinks) {
    const lineItems = await collect(stripe.paymentLinks.listLineItems(link.id, { limit: 100 }));
    for (const item of lineItems) {
      const priceId = priceIdOf(item);
      if (priceId) paymentLinkPriceIds.add(priceId);
    }
  }

  const checkoutSessions = (await collect(stripe.checkout.sessions.list({ limit: 100 }))).filter(
    (session) => session.status === "open",
  );
  for (const session of checkoutSessions) {
    const lineItems = await collect(
      stripe.checkout.sessions.listLineItems(session.id, { limit: 100 }),
    );
    for (const item of lineItems) {
      const priceId = priceIdOf(item);
      if (priceId) checkoutPriceIds.add(priceId);
    }
  }

  return {
    subscriptions,
    paymentLinks,
    checkoutSessions,
    subscriptionPriceIds,
    paymentLinkPriceIds,
    checkoutPriceIds,
  };
}

function findCanonicalProduct(spec, products, activePrices) {
  const productPrices = FOUNDER_PRICES.filter((price) => price.productKey === spec.key);
  for (const expected of productPrices) {
    const existing = expected.lookupKey
      ? activePrices.find((price) => price.lookup_key === expected.lookupKey)
      : activePrices.find(
          (price) =>
            price.metadata?.wireline_price_key === expected.key &&
            price.unit_amount === expected.unitAmount,
        );
    const productId = productIdOf(existing);
    if (productId) {
      const product = products.find((row) => row.id === productId);
      if (product) return product;
    }
  }

  const named = products.filter((product) => product.name === spec.name);
  if (named.length === 1) return named[0];
  return named.find(
    (product) =>
      product.metadata?.wireline_catalog_version?.startsWith("founder_early_access_2026_07") ||
      product.metadata?.wireline_customer_tier,
  );
}

async function ensureProduct(stripe, spec, products, activePrices) {
  const existing = findCanonicalProduct(spec, products, activePrices);
  const metadata = {
    ...(existing?.metadata || {}),
    ...spec.metadata,
    wireline_catalog_version: FOUNDER_CATALOG_VERSION,
  };

  if (!existing) {
    return {
      action: "created",
      product: await stripe.products.create({
        name: spec.name,
        description: spec.description,
        active: true,
        metadata,
      }),
    };
  }

  return {
    action: existing.active ? "updated" : "reactivated",
    product: await stripe.products.update(existing.id, {
      name: spec.name,
      description: spec.description,
      active: true,
      metadata,
    }),
  };
}

async function ensurePrice(stripe, product, spec, activePrices) {
  const existing = spec.lookupKey
    ? activePrices.find((price) => price.lookup_key === spec.lookupKey)
    : activePrices.find(
        (price) =>
          productIdOf(price) === product.id &&
          price.metadata?.wireline_price_key === spec.key &&
          price.unit_amount === spec.unitAmount,
      );

  if (existing) {
    if (
      productIdOf(existing) !== product.id ||
      existing.currency !== "usd" ||
      existing.unit_amount !== spec.unitAmount ||
      !sameRecurring(existing.recurring, spec.recurring)
    ) {
      throw new Error(
        `Existing price ${existing.id} for ${spec.key} conflicts with the Founder catalog.`,
      );
    }

    const price = await stripe.prices.update(existing.id, {
      active: true,
      nickname: spec.nickname,
      metadata: {
        ...(existing.metadata || {}),
        ...spec.metadata,
        wireline_price_key: spec.key,
        wireline_catalog_state: "launch_active",
        wireline_catalog_version: FOUNDER_CATALOG_VERSION,
      },
    });
    return { action: "updated", price };
  }

  const params = {
    product: product.id,
    currency: "usd",
    unit_amount: spec.unitAmount,
    nickname: spec.nickname,
    metadata: {
      ...spec.metadata,
      wireline_price_key: spec.key,
      wireline_catalog_state: "launch_active",
      wireline_catalog_version: FOUNDER_CATALOG_VERSION,
    },
  };
  if (spec.lookupKey) params.lookup_key = spec.lookupKey;
  if (spec.recurring) params.recurring = spec.recurring;

  return { action: "created", price: await stripe.prices.create(params) };
}

function priceIsBlocked(priceId, dependencies) {
  const reasons = [];
  if (dependencies.subscriptionPriceIds.has(priceId)) reasons.push("live subscription");
  if (dependencies.paymentLinkPriceIds.has(priceId)) reasons.push("active payment link");
  if (dependencies.checkoutPriceIds.has(priceId)) reasons.push("open checkout session");
  return reasons;
}

async function main() {
  const secret = loadStripeSecret();
  if (!secret) {
    console.error("STRIPE_SECRET_KEY is required. Pull the Vercel production env first.");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const account = await stripe.accounts.retrieve();
  const productsBefore = await collect(stripe.products.list({ limit: 100 }));
  const activePricesBefore = await collect(stripe.prices.list({ active: true, limit: 100 }));
  const dependencies = await dependencySnapshot(stripe);
  const canonicalProductIds = new Set();
  const canonicalPriceIds = new Set();
  const productResults = [];
  const priceResults = [];
  const generatedEnv = {};

  for (const productSpec of FOUNDER_PRODUCTS) {
    const ensured = await ensureProduct(stripe, productSpec, productsBefore, activePricesBefore);
    canonicalProductIds.add(ensured.product.id);
    productResults.push({
      key: productSpec.key,
      id: ensured.product.id,
      name: ensured.product.name,
      action: ensured.action,
    });

    const pricesForProduct = FOUNDER_PRICES.filter(
      (priceSpec) => priceSpec.productKey === productSpec.key,
    );
    const ensuredByKey = new Map();
    for (const priceSpec of pricesForProduct) {
      const priceResult = await ensurePrice(
        stripe,
        ensured.product,
        priceSpec,
        activePricesBefore,
      );
      canonicalPriceIds.add(priceResult.price.id);
      ensuredByKey.set(priceSpec.key, priceResult.price);
      if (priceSpec.envTarget) generatedEnv[priceSpec.envTarget] = priceResult.price.id;
      priceResults.push({
        key: priceSpec.key,
        id: priceResult.price.id,
        product: ensured.product.name,
        action: priceResult.action,
        env_target: priceSpec.envTarget,
      });
    }

    const defaultPrice = productSpec.defaultPriceKey
      ? ensuredByKey.get(productSpec.defaultPriceKey)
      : null;
    if (defaultPrice && ensured.product.default_price !== defaultPrice.id) {
      await stripe.products.update(ensured.product.id, { default_price: defaultPrice.id });
    }
  }

  const cleanup = [];
  for (const price of activePricesBefore) {
    if (canonicalPriceIds.has(price.id)) continue;
    const product = productsBefore.find((row) => row.id === productIdOf(price));
    const looksManaged =
      product?.name?.startsWith("Wireline ") ||
      product?.name === "Conversation Balance" ||
      !!price.metadata?.wireline_plan_id ||
      !!price.metadata?.wireline_addon_id ||
      !!price.metadata?.wireline_price_key ||
      !!price.metadata?.wireline_catalog_state;
    if (!looksManaged) continue;

    const retainedRetiredDefault =
      product &&
      !canonicalProductIds.has(product.id) &&
      product.default_price === price.id;
    if (retainedRetiredDefault) {
      cleanup.push({
        type: "price",
        id: price.id,
        action: "retained_default_until_product_archive",
      });
      continue;
    }

    const blockedBy = priceIsBlocked(price.id, dependencies);
    if (blockedBy.length) {
      cleanup.push({ type: "price", id: price.id, action: "skipped", blocked_by: blockedBy });
      continue;
    }

    await stripe.prices.update(price.id, {
      active: false,
      metadata: {
        ...(price.metadata || {}),
        wireline_catalog_state: "retired",
        wireline_retired_by: "founder_catalog_reconciler",
        wireline_retired_at_version: FOUNDER_CATALOG_VERSION,
      },
    });
    cleanup.push({ type: "price", id: price.id, action: "deactivated" });
  }

  for (const product of productsBefore.filter((row) => row.active)) {
    if (canonicalProductIds.has(product.id)) continue;
    if (!product.name?.startsWith("Wireline ") && product.name !== "Conversation Balance") continue;

    const productPriceIds = activePricesBefore
      .filter((price) => productIdOf(price) === product.id)
      .map((price) => price.id);
    const blockedBy = [
      ...new Set(productPriceIds.flatMap((priceId) => priceIsBlocked(priceId, dependencies))),
    ];
    if (blockedBy.length) {
      cleanup.push({ type: "product", id: product.id, action: "skipped", blocked_by: blockedBy });
      continue;
    }

    await stripe.products.update(product.id, {
      active: false,
      metadata: {
        ...(product.metadata || {}),
        wireline_catalog_state: "retired",
        wireline_retired_by: "founder_catalog_reconciler",
        wireline_retired_at_version: FOUNDER_CATALOG_VERSION,
      },
    });
    cleanup.push({ type: "product", id: product.id, action: "archived" });
  }

  const productsAfter = await collect(stripe.products.list({ active: true, limit: 100 }));
  const pricesAfter = await collect(stripe.prices.list({ active: true, limit: 100 }));
  const manifest = {
    generated_at: new Date().toISOString(),
    account_id: account.id,
    catalog_version: FOUNDER_CATALOG_VERSION,
    status: cleanup.some((item) => item.action === "skipped")
      ? "applied_with_dependency_warnings"
      : "applied",
    audit_snapshot: {
      live_subscriptions: dependencies.subscriptions.length,
      active_payment_links: dependencies.paymentLinks.length,
      open_checkout_sessions: dependencies.checkoutSessions.length,
      active_products_before: productsBefore.filter((product) => product.active).length,
      active_products_after: productsAfter.length,
      active_prices_before: activePricesBefore.length,
      active_prices_after: pricesAfter.length,
    },
    applied_writes: {
      products: productResults,
      prices: priceResults,
      cleanup,
    },
    generated_env: generatedEnv,
    guardrails: [
      "Free Builder has no Stripe product or recurring price.",
      "Founder plans use guaranteed voice capacity plus prepaid overflow.",
      "No postpaid voice-overage price is created.",
      "A price or product with a live dependency is never retired automatically.",
    ],
  };

  writeFileSync(CATALOG_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(GENERATED_ENV_PATH, `${JSON.stringify(generatedEnv, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
