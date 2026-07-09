#!/usr/bin/env node
/**
 * Push Resend env vars to the Wireline Vercel project (encrypted · all targets).
 *
 * Usage:
 *   $env:VERCEL_TOKEN = "<token>"
 *   $env:RESEND_API_KEY = "re_..."
 *   $env:RESEND_FROM_EMAIL = "Wireline <noreply@trywireline.com>"
 *   # or: $env:RESEND_FROM_DOMAIN = "trywireline.com"
 *   node scripts/sync-resend-env-to-vercel.mjs
 */

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const TARGETS = ["production", "preview", "development"];

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

const envMap = { RESEND_API_KEY: resendKey };
const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const fromDomain = process.env.RESEND_FROM_DOMAIN?.trim();
if (fromEmail) envMap.RESEND_FROM_EMAIL = fromEmail;
if (fromDomain) envMap.RESEND_FROM_DOMAIN = fromDomain;
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
  console.log("Syncing Resend env vars to Vercel (encrypted · production + preview + development)…\n");
  for (const [key, value] of Object.entries(envMap)) {
    await upsertEnv(key, value);
  }
  console.log("\nDone. Redeploy production for serverless functions to pick up new values.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
