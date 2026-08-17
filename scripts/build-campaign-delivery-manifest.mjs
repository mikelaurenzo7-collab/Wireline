#!/usr/bin/env node
/**
 * Build an editor-ready manifest for reviewed Wireline campaign audio.
 *
 * This script never contacts an AI provider and never runs in the product
 * runtime. Render voice and music first, review them, then assemble an export
 * package under the ignored official-assets/ directory.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAMPAIGN_VO, DEFAULT_VOICE_ID } from "./generate-campaign-vo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "official-assets/campaign-studio/delivery-manifest.json");
const audioRoot = "official-assets/audio";

async function assetState(file) {
  try {
    return (await stat(resolve(root, audioRoot, file))).size > 0 ? "rendered" : "missing";
  } catch {
    return "missing";
  }
}

export async function buildCampaignDeliveryManifest() {
  const voiceovers = await Promise.all(
    CAMPAIGN_VO.map(async (track) => ({
      id: track.id,
      type: "voiceover",
      path: `${audioRoot}/${track.file}`,
      targetSeconds: track.targetSeconds,
      state: await assetState(track.file),
      review: "human approval required",
      usage: "marketing and reference only; never live call audio",
      pictureRule: "Use only exact-production Wireline product proof.",
    })),
  );

  return {
    schemaVersion: 1,
    campaign: "Wireline Second Ring",
    voice: { provider: "ElevenLabs", voiceId: DEFAULT_VOICE_ID },
    approvalGate: [
      "brand and claim review",
      "audio quality and pronunciation review",
      "rights and platform clearance",
      "exact-production product-proof review",
    ],
    audio: voiceovers,
    sonicAssets: [
      {
        id: "wireline-sonic-mark-2s",
        type: "music",
        targetSeconds: 2,
        state: "brief only",
        review: "human approval required",
        usage: "end cards, stadium/Digital OOH, social bumpers; never active calls",
      },
      {
        id: "wireline-hero-bed-15s",
        type: "music",
        targetSeconds: 15,
        state: "brief only",
        review: "human approval required",
        usage: "commercials only; duck or remove beneath real agent audio",
      },
    ],
  };
}

async function main() {
  const manifest = await buildCampaignDeliveryManifest();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[campaign-studio] wrote ${output}`);
  const missing = manifest.audio.filter((asset) => asset.state === "missing").map((asset) => asset.id);
  if (missing.length) console.log(`[campaign-studio] pending renders: ${missing.join(", ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error("[campaign-studio] Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
