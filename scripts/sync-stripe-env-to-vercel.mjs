#!/usr/bin/env node
/**
 * Push Stripe launch price-ID env vars to the Wireline Vercel project.
 * Sets type=plain (not sensitive) on production, preview, and development.
 *
 * Usage:
 *   $env:VERCEL_TOKEN = "<token>"
 *   node scripts/setup-stripe-catalog.mjs
 *   node scripts/sync-stripe-env-to-vercel.mjs
 *
 * Default JSON path: scripts/.stripe-env.generated.json
 *
 * Safety: the fallback intentionally leaves Stripe price IDs blank. The prior
 * committed generated file pointed at the old $49/$149 catalog; syncing stale
 * IDs would silently overcharge launch customers. Run stripe:setup first.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const TARGETS = ["production", "preview", "development"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultJsonPath = join(__dirname, ".stripe-env.generated.json");

const FALLBACK_ENV = {
  STRIPE_VOICE_OVERAGE_METER_EVENT_NAME: "voice_minutes_overage",
  STRIPE_BUSINESS_STARTER_PRICE_ID: "",
  STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID: "",
  STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID: "",
  STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID: "",
  STRIPE_PRO_PRICE_ID: "",
  STRIPE_PRO_ANNUAL_PRICE_ID: "",
  STRIPE_PRO_EXTRA_AGENT_PRICE_ID: "",
  STRIPE_PRO_OVERAGE_PRICE_ID: "",
  STRIPE_LIVE_VIDEO_ADDON_PRICE_ID: "",
};

const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
if (!token) {
  console.error("Set VERCEL_TOKEN (or VERCEL_OIDC_TOKEN) in the environment.");
  process.exit(1);
}

function vercelUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(TEAM_ID)}`;
}

async function vercelFetch(path, opts = {}) {
  const res = await fetch(vercelUrl(path), {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status}: ${text.slice(0, 800)}`);
  }
  return body;
}

function loadEnvMap(argvPath) {
  const jsonPath = argvPath || defaultJsonPath;
  if (existsSync(jsonPath)) {
    const raw = readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.env) return parsed.env;
    return parsed;
  }
  return FALLBACK_ENV;
}

async function listProjectEnv() {
  const data = await vercelFetch(
    `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env?decrypt=true`,
    { method: "GET" },
  );
  return data.envs || [];
}

async function deleteEnv(envId) {
  await vercelFetch(
    `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env/${encodeURIComponent(envId)}`,
    { method: "DELETE" },
  );
}

async function createEnv(key, value) {
  await vercelFetch(`/v10/projects/${encodeURIComponent(PROJECT_ID)}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "plain",
      target: TARGETS,
    }),
  });
  console.log(`  + created ${key}`);
}

async function upsertEnv(key, value) {
  const existing = (await listProjectEnv()).find((e) => e.key === key);
  if (!existing) {
    await createEnv(key, value);
    return;
  }

  const wantsPlain = true;
  const isSensitive = existing.type === "encrypted" || existing.type === "sensitive";

  if (isSensitive && wantsPlain) {
    await deleteEnv(existing.id);
    await createEnv(key, value);
    console.log(`  ~ recreated ${key} (was sensitive -> plain)`);
    return;
  }

  try {
    await vercelFetch(
      `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          value,
          type: "plain",
          target: TARGETS,
        }),
      },
    );
    console.log(`  ~ updated ${key}`);
  } catch (err) {
    if (/cannot change the type/i.test(String(err.message))) {
      await deleteEnv(existing.id);
      await createEnv(key, value);
      console.log(`  ~ recreated ${key} (type change)`);
      return;
    }
    throw err;
  }
}

async function main() {
  const envMap = loadEnvMap(process.argv[2]);
  writeFileSync(defaultJsonPath, JSON.stringify(envMap, null, 2) + "\n");
  console.log("Syncing Stripe launch env vars to Vercel (plain, all targets)...\n");

  for (const [key, value] of Object.entries(envMap)) {
    if (!value) {
      console.log(`  - skip ${key} (empty - run stripe:setup to generate a launch price ID)`);
      continue;
    }
    await upsertEnv(key, value);
  }

  console.log("\nDone. Redeploy production for serverless functions to pick up new values.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
