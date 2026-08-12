#!/usr/bin/env node
/**
 * Deactivate legacy default prices on retired Stripe products.
 *
 * Stripe blocks archiving a product's default price directly. This script swaps
 * each retired product's default to a $0 archival anchor, then deactivates the
 * legacy monthly defaults that were still purchasable.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/deactivate-retired-stripe-default-prices.mjs
 *   VERCEL_TOKEN=... npm run stripe:deactivate-retired-defaults
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const API_VERSION = "2026-07-29.dahlia";

const RETIRED_PRODUCT_NAMES = [
  "Wireline Plus",
  "Wireline Household",
  "Wireline Custom",
  "Wireline Concierge",
  "Wireline Everyday",
];

function loadStripeSecret() {
  if (process.env.STRIPE_SECRET_KEY?.trim()) return process.env.STRIPE_SECRET_KEY.trim();
  for (const candidate of [join(ROOT, ".env.local"), join(ROOT, ".tmp", "vercel-production.env")]) {
    if (!existsSync(candidate)) continue;
    const match = readFileSync(candidate, "utf8").match(/^STRIPE_SECRET_KEY=(.+)$/m);
    if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

async function collect(iterator) {
  const rows = [];
  for await (const row of iterator) rows.push(row);
  return rows;
}

async function ensureArchivalAnchor(stripe, product) {
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

async function main() {
  const secret = loadStripeSecret();
  if (!secret) {
    console.error("STRIPE_SECRET_KEY is required.");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const products = await collect(stripe.products.list({ limit: 100 }));
  const byName = new Map(products.map((product) => [product.name, product]));
  const actions = [];

  for (const name of RETIRED_PRODUCT_NAMES) {
    const product = byName.get(name);
    if (!product) {
      actions.push({ name, status: "skipped", reason: "product not found" });
      continue;
    }

    const anchorId = await ensureArchivalAnchor(stripe, product);
    const activePrices = await collect(
      stripe.prices.list({ product: product.id, active: true, limit: 100 }),
    );

    for (const price of activePrices) {
      if (price.id === anchorId) continue;
      if (price.metadata?.wireline_catalog_state === "retired_anchor") continue;
      await stripe.prices.update(price.id, { active: false });
      actions.push({
        name,
        status: "deactivated",
        price_id: price.id,
        nickname: price.nickname,
      });
    }

    if (!product.active) {
      actions.push({ name, status: "ok", anchor_id: anchorId });
      continue;
    }

    await stripe.products.update(product.id, {
      active: false,
      metadata: {
        ...(product.metadata || {}),
        wireline_catalog_state: "retired",
        wireline_retired_by: "deactivate_retired_default_prices",
      },
    });
    actions.push({ name, status: "archived_product", anchor_id: anchorId });
  }

  console.log(JSON.stringify({ actions }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
