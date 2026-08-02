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
 * Safety: the generated file must exist AND carry the same
 * wireline_catalog_version as the code manifest — a stale file from a prior
 * catalog generation (the old $49/$149 set, or an archived founder version)
 * would silently push retired price ids over the live configuration. There is
 * deliberately no fallback: run `npm run stripe:setup` first, always.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FOUNDER_CATALOG_VERSION } from "./lib/stripe-founder-catalog.mjs";
import { TEAM_ID, PROJECT_ID } from "./lib/vercel-project.mjs";

const TARGETS = ["production", "preview", "development"];

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultJsonPath = join(__dirname, ".stripe-env.generated.json");

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
  if (!existsSync(jsonPath)) {
    console.error(
      `Generated Stripe env file not found at ${jsonPath}. Run \`npm run stripe:setup\` first — ` +
        "there is intentionally no fallback, so stale or retired price ids can never be synced.",
    );
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
  const fileVersion = parsed.wireline_catalog_version;
  if (fileVersion !== FOUNDER_CATALOG_VERSION) {
    console.error(
      `Generated Stripe env file is stale: it carries catalog version ` +
        `${JSON.stringify(fileVersion ?? "none (legacy flat file)")} but the code manifest is ` +
        `"${FOUNDER_CATALOG_VERSION}". Run \`npm run stripe:setup\` to regenerate before syncing.`,
    );
    process.exit(1);
  }
  return parsed.env;
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
