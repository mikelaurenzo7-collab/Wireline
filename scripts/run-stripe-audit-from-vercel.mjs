#!/usr/bin/env node
/**
 * Pull STRIPE_SECRET_KEY from Vercel (decrypt) and run the read-only live
 * account-identity and catalog audits.
 *
 * Usage: VERCEL_TOKEN=... node scripts/run-stripe-audit-from-vercel.mjs
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

const auditScripts = [
  "audit-stripe-account-identity-live.mjs",
  "audit-stripe-catalog-live.mjs",
];
let failed = false;

for (const auditScript of auditScripts) {
  const result = spawnSync("node", [join(ROOT, "scripts", auditScript)], {
    cwd: ROOT,
    env: { ...process.env, STRIPE_SECRET_KEY: stripeKey },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
