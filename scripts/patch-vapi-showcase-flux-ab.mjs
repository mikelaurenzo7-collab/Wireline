#!/usr/bin/env node
/**
 * Apply Flux EOT transcriber to Liam's Vapi assistant; keep Sarah on Nova+LiveKit.
 * Run after deploy so static assistant config matches webhook assistant-request payloads.
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

const NOVA_TRANSCRIBER = {
  provider: "deepgram",
  model: "nova-3",
  language: "en",
  smartFormat: true,
  endpointing: 40,
};

const NOVA_START_SPEAKING = {
  waitSeconds: 0.05,
  smartEndpointingPlan: {
    provider: "livekit",
    waitFunction: "2000 / (1 + exp(-10 * (x - 0.5)))",
  },
};

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

function patchForAgent(name) {
  if (/^Liam/i.test(name)) {
    return {
      ...SHARED,
      transcriber: FLUX_TRANSCRIBER,
      startSpeakingPlan: FLUX_START_SPEAKING,
      metadata: { wireline_transcriber_mode: "flux-eot", wireline_showcase_agent: "Liam" },
    };
  }
  if (/^Sarah/i.test(name)) {
    return {
      ...SHARED,
      transcriber: NOVA_TRANSCRIBER,
      startSpeakingPlan: NOVA_START_SPEAKING,
      metadata: { wireline_transcriber_mode: "nova-livekit", wireline_showcase_agent: "Sarah" },
    };
  }
  return null;
}

async function main() {
  const assistants = await vapiFetch("/assistant?limit=100");
  console.log("Wireline employee A/B — Flux on Liam, Nova+LiveKit on Sarah\n");

  for (const a of assistants) {
    const patch = patchForAgent(a.name || "");
    if (!patch) continue;
    await vapiFetch(`/assistant/${a.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    const mode = patch.metadata.wireline_transcriber_mode;
    console.log(`  ✓ ${a.name} → ${mode} (${patch.transcriber.model})`);
  }

  console.log("\nSarah (630) 642-5661 — control (Nova-3 + LiveKit)");
  console.log("Liam  (630) 581-1834 — experiment (Flux EOT)");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
