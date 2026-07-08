#!/usr/bin/env node
/**
 * Deactivate superseded launch catalog prices (old extra-agent / overage / duplicate balance).
 * Safe when live subscription count is 0 and Vercel env points at the new price ids.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_VERSION = "2026-02-25.clover";

const CANONICAL_FROM_ENV = [
  "STRIPE_BUSINESS_STARTER_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
  "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_PRO_ANNUAL_PRICE_ID",
  "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
  "STRIPE_PRO_OVERAGE_PRICE_ID",
  "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
];

/** Superseded by Jul 2026 pricing lock — must not remain purchasable. */
const STALE_PRICE_IDS = [
  "price_1TmdGhJohDtfy3Ikzgblw3Qx", // Team extra agent $9
  "price_1TmdHkJohDtfy3Ik5g6UijYD", // Business extra agent $12
  "price_1TmdHlJohDtfy3Ik7xEVAwgF", // Business voice overage $0.14
  "price_1Tmd6FJohDtfy3Ik6DmGSYxk", // duplicate balance $5
  "price_1Tmd6FJohDtfy3IkGx39YmpR", // duplicate balance $10
  "price_1Tmd6FJohDtfy3IkPU6R19GS", // duplicate balance $25
  "price_1Tmd6GJohDtfy3IkjcThxnS8", // duplicate balance $50
];

function loadEnv() {
  for (const path of [
    join(ROOT, ".tmp", "vercel-audit.env"),
    join(ROOT, ".tmp", "stripe-env.local"),
    join(ROOT, ".env.local"),
  ]) {
    if (!existsSync(path)) continue;
    const out = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?$/);
      if (m) out[m[1]] = m[2];
    }
    if (out.STRIPE_SECRET_KEY) return out;
  }
  return {};
}

async function main() {
  const env = loadEnv();
  const secret = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("STRIPE_SECRET_KEY required");
    process.exit(1);
  }

  const canonical = new Set(
    CANONICAL_FROM_ENV.map((k) => process.env[k] || env[k]).filter(Boolean),
  );

  const stripe = new Stripe(secret, { apiVersion: API_VERSION });
  const actions = [];

  for (const id of STALE_PRICE_IDS) {
    if (canonical.has(id)) {
      actions.push({ id, status: "skipped", reason: "still referenced in env" });
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(id);
      if (!price.active) {
        actions.push({ id, status: "already_inactive", nickname: price.nickname });
        continue;
      }
      const updated = await stripe.prices.update(id, { active: false });
      actions.push({
        id,
        status: "deactivated",
        nickname: updated.nickname,
        unit_amount: updated.unit_amount,
      });
    } catch (error) {
      actions.push({
        id,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({ canonical: [...canonical], actions }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
