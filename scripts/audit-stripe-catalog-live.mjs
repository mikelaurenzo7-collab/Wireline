#!/usr/bin/env node
/**
 * Read-only audit of the live Stripe account against Founder Early Access.
 *
 * This script performs no writes. It validates the exact active product and
 * price set, then checks that live subscriptions, payment links, and open
 * checkouts do not depend on superseded catalog objects.
 */

import { existsSync, readFileSync } from "node:fs";
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

function addFinding(findings, level, message, metadata = {}) {
  findings.push({ level, message, metadata });
}

function sameRecurring(actual, expected) {
  if (!expected) return !actual;
  return (
    actual?.interval === expected.interval &&
    (actual?.usage_type || "licensed") === (expected.usage_type || "licensed")
  );
}

async function activePaymentLinks(stripe) {
  const rows = [];
  for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
    const lineItems = await collect(stripe.paymentLinks.listLineItems(link.id, { limit: 100 }));
    rows.push({ link, lineItems });
  }
  return rows;
}

async function openCheckoutSessions(stripe) {
  const sessions = (await collect(stripe.checkout.sessions.list({ limit: 100 }))).filter(
    (session) => session.status === "open",
  );
  const rows = [];
  for (const session of sessions) {
    const lineItems = await collect(
      stripe.checkout.sessions.listLineItems(session.id, { limit: 100 }),
    );
    rows.push({ session, lineItems });
  }
  return rows;
}

async function liveSubscriptions(stripe) {
  return (await collect(stripe.subscriptions.list({ status: "all", limit: 100 }))).filter(
    (subscription) => !["canceled", "incomplete_expired"].includes(subscription.status),
  );
}

async function main() {
  const secret = loadStripeSecret();
  if (!secret) {
    console.error("STRIPE_SECRET_KEY is required. Pull the Vercel production env first.");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const account = await stripe.accounts.retrieve();
  const products = await collect(stripe.products.list({ limit: 100 }));
  const activeProducts = products.filter((product) => product.active);
  const activePrices = await collect(stripe.prices.list({ active: true, limit: 100 }));
  const productById = new Map(products.map((product) => [product.id, product]));
  const expectedProductNames = new Set(FOUNDER_PRODUCTS.map((product) => product.name));
  const findings = [];

  for (const expected of FOUNDER_PRODUCTS) {
    const matches = activeProducts.filter((product) => product.name === expected.name);
    if (matches.length !== 1) {
      addFinding(
        findings,
        "error",
        `Expected exactly one active product named ${expected.name}; found ${matches.length}.`,
        { product_ids: matches.map((product) => product.id) },
      );
    }
  }

  for (const product of activeProducts) {
    if (!expectedProductNames.has(product.name)) {
      addFinding(findings, "error", `Unexpected active product: ${product.name}`, {
        product_id: product.id,
      });
    }
  }

  const canonicalPriceIds = new Set();

  for (const expected of FOUNDER_PRICES) {
    const matches = expected.lookupKey
      ? activePrices.filter((price) => price.lookup_key === expected.lookupKey)
      : activePrices.filter((price) => price.metadata?.wireline_price_key === expected.key);

    if (matches.length !== 1) {
      addFinding(
        findings,
        "error",
        `Expected exactly one active price for ${expected.key}; found ${matches.length}.`,
        { price_ids: matches.map((price) => price.id) },
      );
      continue;
    }

    const price = matches[0];
    const product = productById.get(productIdOf(price));
    const expectedProduct = PRODUCT_BY_KEY.get(expected.productKey);
    canonicalPriceIds.add(price.id);

    if (price.currency !== "usd" || price.unit_amount !== expected.unitAmount) {
      addFinding(findings, "error", `Price amount drift for ${expected.key}.`, {
        price_id: price.id,
        expected_unit_amount: expected.unitAmount,
        actual_unit_amount: price.unit_amount,
        currency: price.currency,
      });
    }
    if (!sameRecurring(price.recurring, expected.recurring)) {
      addFinding(findings, "error", `Recurring contract drift for ${expected.key}.`, {
        price_id: price.id,
        expected: expected.recurring,
        actual: price.recurring,
      });
    }
    if (!product || product.name !== expectedProduct?.name) {
      addFinding(findings, "error", `Price ${expected.key} points at the wrong product.`, {
        price_id: price.id,
        expected_product: expectedProduct?.name,
        actual_product: product?.name || null,
      });
    }
  }

  for (const price of activePrices) {
    if (canonicalPriceIds.has(price.id)) continue;
    const product = productById.get(productIdOf(price));
    const retainedRetiredDefault =
      product &&
      !product.active &&
      (product.default_price === price.id ||
        price.metadata?.wireline_catalog_state === "retired_anchor");
    if (retainedRetiredDefault) {
      addFinding(findings, "warning", "Inactive product retains its Stripe-required default price.", {
        price_id: price.id,
        product_id: product.id,
        product: product.name,
      });
      continue;
    }

    const looksManaged =
      expectedProductNames.has(product?.name) ||
      !!price.metadata?.wireline_plan_id ||
      !!price.metadata?.wireline_addon_id ||
      !!price.metadata?.wireline_price_key ||
      !!price.metadata?.wireline_catalog_state;
    if (!looksManaged) continue;

    addFinding(findings, "error", "Superseded Wireline price is still active.", {
      price_id: price.id,
      nickname: price.nickname,
      lookup_key: price.lookup_key,
      product: product?.name || null,
      wireline_price_key: price.metadata?.wireline_price_key || null,
    });
  }

  const [subscriptions, paymentLinks, checkoutSessions] = await Promise.all([
    liveSubscriptions(stripe),
    activePaymentLinks(stripe),
    openCheckoutSessions(stripe),
  ]);

  for (const subscription of subscriptions) {
    for (const item of subscription.items?.data || []) {
      const priceId = priceIdOf(item);
      if (priceId && !canonicalPriceIds.has(priceId)) {
        addFinding(findings, "error", "Live subscription uses a noncanonical price.", {
          subscription_id: subscription.id,
          price_id: priceId,
        });
      }
    }
  }

  for (const { link, lineItems } of paymentLinks) {
    for (const item of lineItems) {
      const priceId = priceIdOf(item);
      if (priceId && !canonicalPriceIds.has(priceId)) {
        addFinding(findings, "error", "Active payment link uses a noncanonical price.", {
          payment_link_id: link.id,
          price_id: priceId,
        });
      }
    }
  }

  for (const { session, lineItems } of checkoutSessions) {
    for (const item of lineItems) {
      const priceId = priceIdOf(item);
      if (priceId && !canonicalPriceIds.has(priceId)) {
        addFinding(findings, "warning", "Open checkout uses a noncanonical price.", {
          checkout_session_id: session.id,
          price_id: priceId,
        });
      }
    }
  }

  const summary = {
    account_id: account.id,
    catalog_version: FOUNDER_CATALOG_VERSION,
    active_products: activeProducts.map((product) => product.name).sort(),
    active_price_count: activePrices.length,
    canonical_price_count: canonicalPriceIds.size,
    live_subscription_count: subscriptions.length,
    active_payment_link_count: paymentLinks.length,
    open_checkout_session_count: checkoutSessions.length,
    findings,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (findings.some((finding) => finding.level === "error")) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
