#!/usr/bin/env node
/**
 * Push Stripe API keys to Vercel (plain · production + preview + development).
 *
 * Usage (PowerShell — do NOT commit these values):
 *   $env:VERCEL_TOKEN = "<token>"
 *   $env:STRIPE_SECRET_KEY = "sk_live_..."
 *   $env:VITE_STRIPE_PUBLIC_KEY = "pk_live_..."
 *   $env:STRIPE_WEBHOOK_SECRET = "whsec_..."
 *   node scripts/sync-stripe-secrets-to-vercel.mjs
 */

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const TARGETS = ["production", "preview", "development"];

const SECRET_KEYS = [
  "STRIPE_SECRET_KEY",
  "VITE_STRIPE_PUBLIC_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
if (!token) {
  console.error("Set VERCEL_TOKEN in the environment.");
  process.exit(1);
}

const envMap = Object.fromEntries(
  SECRET_KEYS.map((key) => [key, process.env[key]?.trim() || ""]),
);
const missing = SECRET_KEYS.filter((k) => !envMap[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
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
  if (!res.ok) {
    throw new Error(`Vercel API ${res.status}: ${text.slice(0, 800)}`);
  }
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
    body: JSON.stringify({ key, value, type: "plain", target: TARGETS }),
  });
  console.log(`  + created ${key}`);
}

async function upsertEnv(key, value) {
  const existing = (await listProjectEnv()).find((e) => e.key === key);
  if (!existing) {
    await createEnv(key, value);
    return;
  }

  const isSensitive = existing.type === "encrypted" || existing.type === "sensitive";
  const targetsMismatch =
    JSON.stringify([...(existing.target || [])].sort()) !== JSON.stringify([...TARGETS].sort());

  if (isSensitive || targetsMismatch) {
    await deleteEnv(existing.id);
    await createEnv(key, value);
    console.log(`  ↻ recreated ${key}${isSensitive ? " (sensitive → plain)" : " (targets updated)"}`);
    return;
  }

  try {
    await vercelFetch(
      `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ value, type: "plain", target: TARGETS }),
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
  console.log("Syncing Stripe secrets to Vercel (plain · production + preview + development)…\n");
  for (const key of SECRET_KEYS) {
    await upsertEnv(key, envMap[key]);
  }
  console.log("\nDone. Redeploy production to pick up new values.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
