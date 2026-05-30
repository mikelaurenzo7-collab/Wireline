#!/usr/bin/env node
/**
 * Apply Deepgram Flux EOT transcriber to all Vapi assistants.
 *
 * Usage:
 *   $env:VAPI_PRIVATE_KEY = "..."
 *   node scripts/patch-vapi-showcase-flux-ab.mjs
 */

const VAPI_BASE = "https://api.vapi.ai";

const FLUX_TRANSCRIBER = {
  provider: "deepgram",
  model: "flux-general-en",
  language: "en",
  eotThreshold: 0.62,
  eotTimeoutMs: 3200,
};

const FLUX_START_SPEAKING = { waitSeconds: 0.05 };

const SHARED = {
  responseDelaySeconds: 0,
  numWordsToInterruptAssistant: 2,
  backgroundDenoisingEnabled: false,
};

const key = process.env.VAPI_PRIVATE_KEY?.trim();
if (!key) {
  console.error("Set VAPI_PRIVATE_KEY.");
  process.exit(1);
}

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
  console.log(`Applying Flux EOT to ${assistants.length} Vapi assistants\n`);

  for (const a of assistants) {
    await vapiFetch(`/assistant/${a.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...SHARED,
        transcriber: FLUX_TRANSCRIBER,
        startSpeakingPlan: FLUX_START_SPEAKING,
        metadata: {
          ...(a.metadata || {}),
          wireline_transcriber_mode: "flux-eot",
        },
      }),
    });
    console.log(`  ✓ ${a.name || a.id}`);
  }

  console.log("\nDone — all assistants on flux-general-en (eotThreshold 0.62, eotTimeoutMs 3200).");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
