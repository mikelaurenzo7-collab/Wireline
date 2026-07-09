#!/usr/bin/env node
/**
 * Push Vapi env vars to the Wireline Vercel project (encrypted · all targets).
 *
 * Usage:
 *   $env:VERCEL_TOKEN = "<token>"
 *   $env:VAPI_PRIVATE_KEY = "..."
 *   $env:VITE_VAPI_PUBLIC_KEY = "..."
 *   $env:VAPI_WEBHOOK_SECRET = "..."   # optional — generates one if unset
 *   node scripts/sync-vapi-env-to-vercel.mjs
 */

import { randomBytes } from "node:crypto";

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const TARGETS = ["production", "preview", "development"];

const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
if (!token) {
  console.error("Set VERCEL_TOKEN in the environment.");
  process.exit(1);
}

const privateKey = process.env.VAPI_PRIVATE_KEY?.trim();
const publicKey = process.env.VITE_VAPI_PUBLIC_KEY?.trim();
let webhookSecret = process.env.VAPI_WEBHOOK_SECRET?.trim();

if (!privateKey || !publicKey) {
  console.error("Set VAPI_PRIVATE_KEY and VITE_VAPI_PUBLIC_KEY.");
  process.exit(1);
}

if (!webhookSecret) {
  webhookSecret = randomBytes(24).toString("hex");
  console.log(`Generated VAPI_WEBHOOK_SECRET (${webhookSecret.length} chars)`);
}

const envMap = {
  VAPI_PRIVATE_KEY: privateKey,
  VITE_VAPI_PUBLIC_KEY: publicKey,
  VAPI_WEBHOOK_SECRET: webhookSecret,
};

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
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
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
    body: JSON.stringify({ key, value, type: "encrypted", target: TARGETS }),
  });
  console.log(`  + created ${key}`);
}

async function upsertEnv(key, value) {
  const existing = (await listProjectEnv()).find((e) => e.key === key);
  if (!existing) {
    await createEnv(key, value);
    return;
  }

  try {
    await vercelFetch(
      `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ value, type: "encrypted", target: TARGETS }),
      },
    );
    console.log(`  ↻ updated ${key}`);
  } catch (err) {
    if (/cannot change the type/i.test(String(err.message))) {
      await deleteEnv(existing.id);
      await createEnv(key, value);
      console.log(`  ↻ recreated ${key} (type change)`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log("Syncing Vapi env vars to Vercel (encrypted · production + preview + development)…\n");
  for (const [key, value] of Object.entries(envMap)) {
    await upsertEnv(key, value);
  }
  console.log("\nDone. Redeploy production for serverless functions to pick up new values.");
  console.log("\nVAPI_WEBHOOK_SECRET for Vapi dashboard / assistant sync:");
  console.log(webhookSecret);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
