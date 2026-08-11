#!/usr/bin/env node
/**
 * Push production Resend env vars to the Wireline Vercel project.
 *
 * Live Resend credentials and production sender configuration are production-
 * only. Preview/Development must use dedicated sandbox credentials or remain
 * unset; this helper never widens a production value across targets.
 *
 * Each value is optional so an operator can sync only the newly-created
 * webhook signing secret without re-supplying or redistributing RESEND_API_KEY.
 * At least one Resend value must be provided.
 *
 * Usage:
 *   $env:VERCEL_TOKEN = "<token>"
 *   $env:RESEND_WEBHOOK_SECRET = "whsec_..."   # from the Resend webhook page
 *   # Optional when rotating/configuring the production sender:
 *   $env:RESEND_API_KEY = "re_..."
 *   $env:RESEND_FROM_EMAIL = "Wireline <noreply@trywireline.com>"
 *   # or: $env:RESEND_FROM_DOMAIN = "trywireline.com"
 *   node scripts/sync-resend-env-to-vercel.mjs
 */
import { TEAM_ID, PROJECT_ID } from "./lib/vercel-project.mjs";

const PRODUCTION_TARGET = ["production"];

const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
if (!token) {
  console.error("Set VERCEL_TOKEN in the environment.");
  process.exit(1);
}

const envEntries = [];
const resendKey = process.env.RESEND_API_KEY?.trim();
if (resendKey) {
  envEntries.push({ key: "RESEND_API_KEY", value: resendKey, targets: PRODUCTION_TARGET });
}

const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
if (webhookSecret) {
  envEntries.push({
    key: "RESEND_WEBHOOK_SECRET",
    value: webhookSecret,
    targets: PRODUCTION_TARGET,
  });
}

const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const fromDomain = process.env.RESEND_FROM_DOMAIN?.trim();
if (fromEmail) {
  envEntries.push({ key: "RESEND_FROM_EMAIL", value: fromEmail, targets: PRODUCTION_TARGET });
}
if (fromDomain) {
  envEntries.push({ key: "RESEND_FROM_DOMAIN", value: fromDomain, targets: PRODUCTION_TARGET });
}

if (envEntries.length === 0) {
  console.error(
    "Set at least one of RESEND_API_KEY, RESEND_WEBHOOK_SECRET, RESEND_FROM_EMAIL, or RESEND_FROM_DOMAIN.",
  );
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

async function createEnv(key, value, targets) {
  await vercelFetch(`/v10/projects/${encodeURIComponent(PROJECT_ID)}/env`, {
    method: "POST",
    body: JSON.stringify({ key, value, type: "encrypted", target: targets }),
  });
  console.log(`  + created ${key} (${targets.join(", ")})`);
}

async function upsertEnv(key, value, targets) {
  const existing = (await listProjectEnv()).find((e) => e.key === key);
  if (!existing) {
    await createEnv(key, value, targets);
    return;
  }

  try {
    await vercelFetch(
      `/v9/projects/${encodeURIComponent(PROJECT_ID)}/env/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ value, type: "encrypted", target: targets }),
      },
    );
    console.log(`  ↻ updated ${key} (${targets.join(", ")})`);
  } catch (err) {
    if (/cannot change the type/i.test(String(err.message))) {
      await deleteEnv(existing.id);
      await createEnv(key, value, targets);
      console.log(`  ↻ recreated ${key} (type change)`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log("Syncing production Resend env vars to Vercel…\n");
  for (const { key, value, targets } of envEntries) {
    await upsertEnv(key, value, targets);
  }
  console.log("\nDone. Redeploy production for serverless functions to pick up changed values.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});