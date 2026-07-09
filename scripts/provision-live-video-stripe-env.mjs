#!/usr/bin/env node
/**
 * Pull STRIPE_SECRET_KEY from Vercel (decrypt), run catalog setup, sync price IDs.
 * Usage: VERCEL_TOKEN=... node scripts/provision-live-video-stripe-env.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getVercelEnvValue } from "./lib/vercel-env-values.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.VERCEL_TOKEN?.trim();

if (!token) {
  console.error("Set VERCEL_TOKEN");
  process.exit(1);
}

const stripeKey = await getVercelEnvValue(token, "STRIPE_SECRET_KEY");
if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not found on Vercel project");

const env = { ...process.env, STRIPE_SECRET_KEY: stripeKey };

function run(label, script) {
  console.log(`\n→ ${label}`);
  const result = spawnSync("node", [join(ROOT, "scripts", script)], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("Reconcile Stripe catalog (incl. live video add-on)", "setup-stripe-catalog.mjs");
run("Sync Stripe price IDs to Vercel", "sync-stripe-env-to-vercel.mjs");
console.log("\nLive video Stripe env provisioned. Redeploy production to pick up STRIPE_LIVE_VIDEO_ADDON_PRICE_ID.");
