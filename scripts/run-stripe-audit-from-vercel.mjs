#!/usr/bin/env node
/**
 * Pull STRIPE_SECRET_KEY from Vercel (decrypt) and run read-only live catalog audit.
 * Usage: VERCEL_TOKEN=... node scripts/run-stripe-audit-from-vercel.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const token = process.env.VERCEL_TOKEN?.trim();

if (!token) {
  console.error("Set VERCEL_TOKEN");
  process.exit(1);
}

const res = await fetch(
  `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?decrypt=true&teamId=${TEAM_ID}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const text = await res.text();
if (!res.ok) throw new Error(`Vercel API ${res.status}: ${text.slice(0, 400)}`);

const { envs = [] } = JSON.parse(text);
const stripeKey = envs.find((e) => e.key === "STRIPE_SECRET_KEY")?.value;
if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not found on Vercel project");

const result = spawnSync("node", [join(ROOT, "scripts", "audit-stripe-catalog-live.mjs")], {
  cwd: ROOT,
  env: { ...process.env, STRIPE_SECRET_KEY: stripeKey },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
