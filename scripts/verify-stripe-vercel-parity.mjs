#!/usr/bin/env node
/** Verify Stripe price env vars match canonical JSON on all Vercel targets. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listVercelEnvs, resolveVercelEnvValue } from "./lib/vercel-env-values.mjs";
import { FOUNDER_CATALOG_VERSION } from "./lib/stripe-founder-catalog.mjs";

const TARGETS = ["production", "preview", "development"];
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const EXTRA_KEYS = [
  "STRIPE_VOICE_OVERAGE_METER_EVENT_NAME",
  "VITE_STRIPE_PUBLIC_KEY",
  "STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID",
];

const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("Set VERCEL_TOKEN");
  process.exit(1);
}

const generated = JSON.parse(
  readFileSync(join(ROOT, "scripts", ".stripe-env.generated.json"), "utf8"),
);
if (generated.wireline_catalog_version !== FOUNDER_CATALOG_VERSION) {
  console.error(
    `Generated Stripe env file is stale: catalog version ` +
      `${JSON.stringify(generated.wireline_catalog_version ?? "none (legacy flat file)")} vs code ` +
      `"${FOUNDER_CATALOG_VERSION}". Run \`npm run stripe:setup\` before checking parity.`,
  );
  process.exit(1);
}
const canon = generated.env;
const keys = [...new Set([...Object.keys(canon), ...EXTRA_KEYS])];

const envs = await listVercelEnvs(token);
const snapshot = {};
for (const key of keys) {
  const rows = envs.filter((e) => e.key === key);
  snapshot[key] = {};
  for (const row of rows) {
    const value = await resolveVercelEnvValue(token, row);
    for (const t of row.target || []) snapshot[key][t] = value;
  }
}

const mismatches = [];
for (const [key, value] of Object.entries(canon)) {
  for (const target of TARGETS) {
    if (snapshot[key]?.[target] !== value) {
      mismatches.push({ key, target, vercel: snapshot[key]?.[target] ?? null, canonical: value });
    }
  }
}

const meter = snapshot.STRIPE_VOICE_OVERAGE_METER_EVENT_NAME;
if (!TARGETS.every((t) => meter?.[t] === "voice_minutes_overage")) {
  mismatches.push({
    key: "STRIPE_VOICE_OVERAGE_METER_EVENT_NAME",
    issue: "not voice_minutes_overage on all targets",
    snapshot: meter,
  });
}

const publishable = snapshot.VITE_STRIPE_PUBLIC_KEY;
const pkOk = TARGETS.every((t) => publishable?.[t]?.startsWith("pk_live_"));
if (!pkOk) {
  mismatches.push({ key: "VITE_STRIPE_PUBLIC_KEY", issue: "missing live publishable key on a target" });
}

console.log(
  JSON.stringify(
    {
      parity: mismatches.length === 0 ? "OK" : "FAIL",
      mismatches,
      targets_checked: TARGETS,
      canonical_keys: Object.keys(canon).length,
    },
    null,
    2,
  ),
);
process.exit(mismatches.length ? 1 : 0);
