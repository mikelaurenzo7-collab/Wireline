#!/usr/bin/env node
/**
 * Push Resend env vars to the Wireline Vercel project.
 *
 * API/send credentials can target every environment. The production webhook
 * signing secret is intentionally production-only because Resend's production
 * endpoint should never authenticate against an arbitrary preview deployment.
 *
 * Usage:
 *   $env:VERCEL_TOKEN = "<token>"
 *   $env:RESEND_API_KEY = "re_..."
 *   $env:RESEND_WEBHOOK_SECRET = "whsec_..."   # from the Resend webhook page
 *   $env:RESEND_FROM_EMAIL = "Wireline <noreply@trywireline.com>"
 *   # or: $env:RESEND_FROM_DOMAIN = "trywireline.com"
 *   node scripts/sync-resend-env-to-vercel.mjs
 */
import { TEAM_ID, PROJECT_ID } from "./lib/vercel-project.mjs";

const ALL_TARGETS = ["production", "preview", "development"];
const PRODUCTION_TARGET = ["production"];

const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
if (!token) {
  console.error("Set VERCEL_TOKEN in the environment.");
  process.exit(1);
}

const resendKey = process.env.RESEND_API_KEY?.trim();
if (!resendKey) {
  console.error("Set RESEND_API_KEY in the environment.");
  process.exit(1);
}

const envEntries = [{ key: "RESEND_API_KEY", value: resendKey, targets: ALL_TARGETS }];
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
if (webhookSecret) {
  envEntries.push({
    key: "RESEND_WEBHOOK_SECRET",
    value: webhookSecret,
    targets: PRODUCTION_TARGET,
  });
} else {
  console.warn(
    "Warning: RESEND_WEBHOOK_SECRET is not set locally. Delivery-feedback ingestion will remain unavailable until the Resend production webhook is created and its signing secret is synced.",
  );
}

const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const fromDomain = process.env.RESEND_FROM_DOMAIN?.trim();
if (fromEmail) envEntries.push({ key: "RESEND_FROM_EMAIL", value: fromEmail, targets: ALL_TARGETS });
if (fromDomain) envEntries.push({ key: "RESEND_FROM_DOMAIN", value: fromDomain, targets: ALL_TARGETS });
if (!fromEmail && !fromDomain) {
  console.warn(
    "Warning: neither RESEND_FROM_EMAIL nor RESEND_FROM_DOMAIN is set locally.\n" +
      "         Production will default to noreply@trywireline.com — must match your verified Resend domain.",
  );
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
  console.log("Syncing Resend env vars to Vercel…\n");
  for (const { key, value, targets } of envEntries) {
    await upsertEnv(key, value, targets);
  }
  console.log("\nDone. Redeploy production for serverless functions to pick up new values.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
