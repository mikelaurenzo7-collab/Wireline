#!/usr/bin/env node
/**
 * Read-only audit of the live Stripe catalog against Wireline's launch model.
 *
 * This script intentionally performs no Stripe writes. Use it before/after
 * `npm run stripe:setup` and before syncing generated Stripe env values.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API_VERSION = "2026-02-25.clover";

const EXPECTED_ACTIVE_PRODUCTS = new Set([
  "Conversation Balance",
  "Wireline Business",
  "Wireline Enterprise",
  "Wireline Personal",
  "Wireline Team",
]);

const EXPECTED_PRICE_KEYS = new Set([
  "balance_5",
  "balance_10",
  "balance_25",
  "balance_50",
  "business_annual",
  "business_extra_agent",
  "business_monthly",
  "business_voice_overage",
  "team_annual",
  "team_extra_agent",
  "team_monthly",
  "team_voice_overage",
]);

const RETIRED_PRODUCT_NAMES = new Set([
  "Custom Enterprise",
  "Front Desk",
  "Office Assistant",
  "Sales & Reception",
  "Solo Agent",
  "Wireline Concierge",
  "Wireline Custom",
  "Wireline Everyday",
  "Wireline Household",
  "Wireline Lead Gen",
  "Wireline Plus",
  "Wireline Starter",
  "Wireline Conversation Balance",
]);

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

function productIdOf(priceOrItem) {
  const price = priceOrItem?.price || priceOrItem;
  if (!price?.product) return null;
  return typeof price.product === "string" ? price.product : price.product.id;
}

function productNameById(products) {
  return new Map(products.map((product) => [product.id, product.name]));
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

async function activePaymentLinkProductIds(stripe) {
  const ids = new Set();
  const links = await collect(stripe.paymentLinks.list({ active: true, limit: 100 }));
  for (const link of links) {
    const lineItems = await collect(stripe.paymentLinks.listLineItems(link.id, { limit: 100 }));
    for (const item of lineItems) {
      const productId = productIdOf(item);
      if (productId) ids.add(productId);
    }
  }
  return { links, ids };
}

async function liveSubscriptionProductIds(stripe) {
  const ids = new Set();
  const subscriptions = [
    ...(await collect(stripe.subscriptions.list({ status: "active", limit: 100 }))),
    ...(await collect(stripe.subscriptions.list({ status: "trialing", limit: 100 }))),
  ];
  for (const subscription of subscriptions) {
    for (const item of subscription.items?.data || []) {
      const productId = productIdOf(item);
      if (productId) ids.add(productId);
    }
  }
  return { subscriptions, ids };
}

async function openCheckoutProductIds(stripe) {
  const ids = new Set();
  const sessions = (await collect(stripe.checkout.sessions.list({ limit: 100 }))).filter(
    (session) => session.status === "open",
  );
  for (const session of sessions) {
    const lineItems = await collect(stripe.checkout.sessions.listLineItems(session.id, { limit: 100 }));
    for (const item of lineItems) {
      const productId = productIdOf(item);
      if (productId) ids.add(productId);
    }
  }
  return { sessions, ids };
}

function addFinding(findings, level, message, metadata = {}) {
  findings.push({ level, message, metadata });
}

async function main() {
  const secret = loadStripeSecret();
  if (!secret) {
    console.error("STRIPE_SECRET_KEY is required. Pull Vercel production env first.");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const account = await stripe.accounts.retrieve();
  const products = await collect(stripe.products.list({ limit: 100 }));
  const activePrices = await collect(stripe.prices.list({ active: true, limit: 100 }));
  const productNames = productNameById(products);
  const findings = [];

  const activeProductNames = new Set(products.filter((product) => product.active).map((p) => p.name));
  for (const expectedName of EXPECTED_ACTIVE_PRODUCTS) {
    if (!activeProductNames.has(expectedName)) {
      addFinding(findings, "error", `Expected active product is missing: ${expectedName}`);
    }
  }
  for (const name of activeProductNames) {
    if (!EXPECTED_ACTIVE_PRODUCTS.has(name)) {
      addFinding(findings, "error", `Unexpected active product: ${name}`);
    }
  }

  for (const product of products) {
    if (RETIRED_PRODUCT_NAMES.has(product.name) && product.active) {
      addFinding(findings, "error", `Retired product is still active: ${product.name}`, {
        product_id: product.id,
      });
    }
  }

  const launchActivePrices = activePrices.filter(
    (price) => price.metadata?.wireline_catalog_state === "launch_active",
  );
  const pricesByKey = new Map();
  for (const price of launchActivePrices) {
    const key = price.metadata?.wireline_price_key || "<missing>";
    if (!pricesByKey.has(key)) pricesByKey.set(key, []);
    pricesByKey.get(key).push(price);
  }

  for (const expectedKey of EXPECTED_PRICE_KEYS) {
    const rows = pricesByKey.get(expectedKey) || [];
    if (rows.length !== 1) {
      addFinding(findings, "error", `Expected exactly one active launch price for ${expectedKey}; found ${rows.length}.`, {
        price_ids: rows.map((row) => row.id),
      });
    }
  }
  for (const key of pricesByKey.keys()) {
    if (!EXPECTED_PRICE_KEYS.has(key)) {
      addFinding(findings, "error", `Unexpected active launch price key: ${key}`);
    }
  }

  for (const price of activePrices) {
    const productName = productNames.get(productIdOf(price));
    if (productName && RETIRED_PRODUCT_NAMES.has(productName)) {
      const isProductDefault = products.find((product) => product.id === productIdOf(price))?.default_price === price.id;
      addFinding(findings, isProductDefault ? "warning" : "error", `Active price remains under retired product: ${productName}`, {
        product_id: productIdOf(price),
        price_id: price.id,
        nickname: price.nickname,
        default_price: isProductDefault,
      });
    }
  }

  const [subs, paymentLinks, checkout] = await Promise.all([
    liveSubscriptionProductIds(stripe),
    activePaymentLinkProductIds(stripe),
    openCheckoutProductIds(stripe),
  ]);

  for (const productId of subs.ids) {
    const productName = productNames.get(productId);
    if (productName && RETIRED_PRODUCT_NAMES.has(productName)) {
      addFinding(findings, "error", `Live subscription depends on retired product: ${productName}`, {
        product_id: productId,
      });
    }
  }
  for (const productId of paymentLinks.ids) {
    const productName = productNames.get(productId);
    if (productName && RETIRED_PRODUCT_NAMES.has(productName)) {
      addFinding(findings, "error", `Active payment link depends on retired product: ${productName}`, {
        product_id: productId,
      });
    }
  }
  for (const productId of checkout.ids) {
    const productName = productNames.get(productId);
    if (productName && RETIRED_PRODUCT_NAMES.has(productName)) {
      addFinding(findings, "warning", `Open checkout session depends on retired product: ${productName}`, {
        product_id: productId,
      });
    }
  }

  const summary = {
    account_id: account.id,
    active_products: sortStrings(activeProductNames),
    active_price_count: activePrices.length,
    launch_active_price_count: launchActivePrices.length,
    live_subscription_count: subs.subscriptions.length,
    active_payment_link_count: paymentLinks.links.length,
    open_checkout_session_count: checkout.sessions.length,
    findings,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (findings.some((finding) => finding.level === "error")) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
