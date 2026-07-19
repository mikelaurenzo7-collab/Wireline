#!/usr/bin/env node
/**
 * Point all Vapi assistants + phone numbers at trywireline.com and attach
 * the webhook secret that matches Vercel's VAPI_WEBHOOK_SECRET.
 *
 * Usage:
 *   $env:VAPI_PRIVATE_KEY = "..."
 *   $env:VAPI_WEBHOOK_SECRET = "..."
 *   node scripts/patch-vapi-prod-webhooks.mjs
 */

const VAPI_BASE = "https://api.vapi.ai";
const WEBHOOK_URL = "https://trywireline.com/api/vapi-webhook";

const key = process.env.VAPI_PRIVATE_KEY?.trim();
const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
const credentialId = process.env.VAPI_WEBHOOK_CREDENTIAL_ID?.trim();
if (!key || (!credentialId && !secret)) {
  console.error(
    "Set VAPI_PRIVATE_KEY and either VAPI_WEBHOOK_CREDENTIAL_ID or VAPI_WEBHOOK_SECRET.",
  );
  process.exit(1);
}

const webhookServer = {
  url: WEBHOOK_URL,
  ...(credentialId ? { credentialId } : { secret }),
};

async function vapiFetch(path, opts = {}) {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const assistants = await vapiFetch("/assistant?limit=100");
  const phones = await vapiFetch("/phone-number?limit=100");

  console.log(`Patching ${assistants.length} assistants → ${WEBHOOK_URL}\n`);

  for (const a of assistants) {
    const currentUrl = a.server?.url || a.serverUrl || "";
    const payload = { server: webhookServer };
    await vapiFetch(`/assistant/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    console.log(`  ✓ ${a.name || a.id}${currentUrl !== WEBHOOK_URL ? ` (was ${currentUrl})` : ""}`);
  }

  console.log(`\nPatching ${phones.length} phone numbers\n`);
  for (const p of phones) {
    await vapiFetch(`/phone-number/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        server: webhookServer,
      }),
    });
    console.log(`  ✓ ${p.number || p.id}`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
