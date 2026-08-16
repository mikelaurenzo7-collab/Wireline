#!/usr/bin/env node
/**
 * Replace Wireline's server-only Vapi credentials in Vercel production.
 *
 * Public browser previews no longer use VITE_VAPI_PUBLIC_KEY. They mint a
 * short-lived Wireline ticket and reach Vapi through a private-key server
 * proxy. This script therefore manages only server credentials, never exposes
 * secret values, and deliberately removes stale preview/development copies.
 *
 * Usage:
 *   $env:VERCEL_TOKEN = "<token>"
 *   $env:VAPI_PRIVATE_KEY = "..."
 *   $env:VAPI_WEBHOOK_SECRET = "..."
 *   node scripts/sync-vapi-env-to-vercel.mjs
 */

import { TEAM_ID, PROJECT_ID } from "./lib/vercel-project.mjs";

const TARGETS = ["production"];
const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;

if (!token) {
  console.error("Set VERCEL_TOKEN in the environment.");
  process.exit(1);
}

const privateKey = process.env.VAPI_PRIVATE_KEY?.trim();
const webhookSecret = process.env.VAPI_WEBHOOK_SECRET?.trim();

if (!privateKey || !webhookSecret) {
  console.error("Set VAPI_PRIVATE_KEY and VAPI_WEBHOOK_SECRET.");
  process.exit(1);
}

const envMap = {
  VAPI_PRIVATE_KEY: privateKey,
  VAPI_WEBHOOK_SECRET: webhookSecret,
};

function vercelUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${separator}teamId=${encodeURIComponent(TEAM_ID)}`;
}

async function vercelFetch(path, options = {}) {
  const response = await fetch(vercelUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vercel API ${response.status}: ${text.slice(0, 800)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function listProjectEnvMetadata() {
  const data = await vercelFetch(
    `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env`,
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

async function createProductionEnv(key, value) {
  await vercelFetch(`/v10/projects/${encodeURIComponent(PROJECT_ID)}/env`, {
    method: "POST",
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: TARGETS,
    }),
  });
}

async function replaceProductionEnv(key, value, allEntries) {
  const existing = allEntries.filter((entry) => entry.key === key);
  for (const entry of existing) {
    await deleteEnv(entry.id);
  }
  await createProductionEnv(key, value);
  console.log(`  ✓ rotated ${key} for production only`);
}

async function removeLegacyPublicKey(allEntries) {
  const legacy = allEntries.filter((entry) => entry.key === "VITE_VAPI_PUBLIC_KEY");
  for (const entry of legacy) {
    await deleteEnv(entry.id);
  }
  if (legacy.length) {
    console.log("  ✓ removed legacy VITE_VAPI_PUBLIC_KEY from all Vercel targets");
  }
}

async function main() {
  console.log("Rotating Wireline Vapi server credentials in Vercel production…\n");
  const entries = await listProjectEnvMetadata();

  for (const [key, value] of Object.entries(envMap)) {
    await replaceProductionEnv(key, value, entries);
  }
  await removeLegacyPublicKey(entries);

  console.log("\nDone. No credential values were requested from Vercel or printed.");
  console.log("Redeploy production so every serverless function receives the rotated values.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
