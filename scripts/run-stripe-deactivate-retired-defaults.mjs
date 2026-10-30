#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

if (!stripeKey) {
  console.error("Set STRIPE_SECRET_KEY");
  process.exit(1);
}

const result = spawnSync(
  "node",
  [join(ROOT, "scripts", "deactivate-retired-stripe-default-prices.mjs")],
  {
    cwd: ROOT,
    env: { ...process.env, STRIPE_SECRET_KEY: stripeKey },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
