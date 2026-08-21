#!/usr/bin/env node
/**
 * Pre-bake the BotBound singing-receptionist jingle.
 *
 * BotBound's /showcase page features a "fun" demo agent (Mira) that
 * sings the moment a caller connects, then catches itself with a
 * normal greeting. No BotBound jingle is approved or committed yet;
 * the route uses its spoken fallback until reviewed audio and provenance
 * are present and BOTBOUND_JINGLE_ASSET_APPROVED=true.
 *
 * This script is the canonical generation path through the ElevenLabs
 * Music API. It writes the MP3 plus a recipe-and-byte provenance sidecar.
 * Review both outputs before committing them or enabling approval.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=… node scripts/generate-jingle.mjs
 *
 *   # If you already have a .env file with the key:
 *   node -r dotenv/config scripts/generate-jingle.mjs
 *
 *   # Custom prompt:
 *   ELEVENLABS_API_KEY=… node scripts/generate-jingle.mjs \
 *     --prompt "Upbeat playful jingle, female voice…" \
 *     --length 8000
 *
 * Endpoint hit:
 *   POST https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128
 * Docs:
 *   https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music
 * Response is binary MP3 (sync — no polling needed).
 *
 * Output:
 *   public/sounds/botbound-jingle.mp3
 *
 * Cost: ~$0.02 per second of generated audio (≈ $0.16 for an 8s
 * jingle). One-time spend — commit the reviewed MP3 and its .sha256
 * sidecar together so the build can authenticate the static asset.
 *
 * Do not regenerate this through a production admin route.
 * Vercel's filesystem is ephemeral; run this script locally,
 * review the MP3 and provenance sidecar, then commit both so every
 * approved deployment serves the same authenticated bytes.
 *
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  audioProvenanceMatches,
  readAudioProvenance,
  writeAudioProvenance,
} from "./lib/audio-provenance.mjs";
import { assertGeneratedMp3 } from "./generate-campaign-vo.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
export const BOTBOUND_JINGLE_OUTPUT_PATH = resolve(REPO_ROOT, "public/sounds/botbound-jingle.mp3");

const DEFAULT_PROMPT =
  "Upbeat playful jingle, female voice singing 'Welcome to BotBound, your phones are alive! Call us anytime, day or night!' — pop style, 8 seconds.";
const DEFAULT_LENGTH_MS = 8000;
const MUSIC_MODEL_ID = "music_v1";
const MUSIC_OUTPUT_FORMAT = "mp3_44100_128";
const RETIRED_PUBLIC_BRAND = /\bWireline\b|trywireline\.com/i;

export function assertBotBoundJinglePrompt(prompt) {
  if (RETIRED_PUBLIC_BRAND.test(prompt)) {
    throw new Error("Jingle prompt still contains retired public branding.");
  }
}

export function jingleFingerprint(prompt, length) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 2,
        prompt,
        length,
        model: MUSIC_MODEL_ID,
        outputFormat: MUSIC_OUTPUT_FORMAT,
      }),
    )
    .digest("hex");
}

export async function validateBotBoundJingleAsset() {
  const provenance = await readAudioProvenance(BOTBOUND_JINGLE_OUTPUT_PATH);
  const prompt = provenance?.prompt;
  const length = provenance?.length;
  if (typeof prompt !== "string" || !Number.isInteger(length)) return false;
  try {
    assertBotBoundJinglePrompt(prompt);
  } catch {
    return false;
  }
  const matches = await audioProvenanceMatches(
    BOTBOUND_JINGLE_OUTPUT_PATH,
    jingleFingerprint(prompt, length),
  );
  if (!matches) return false;
  try {
    assertGeneratedMp3(
      await readFile(BOTBOUND_JINGLE_OUTPUT_PATH),
      "audio/mpeg",
      "Approved BotBound jingle",
    );
    return true;
  } catch {
    return false;
  }
}

function parseArgs() {
  const args = { prompt: DEFAULT_PROMPT, length: DEFAULT_LENGTH_MS, force: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--prompt" || a === "-p") && argv[i + 1]) {
      args.prompt = argv[++i];
    } else if ((a === "--length" || a === "-l") && argv[i + 1]) {
      args.length = parseInt(argv[++i], 10);
    } else if (a === "--force" || a === "-f") {
      args.force = true;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: ELEVENLABS_API_KEY=… node scripts/generate-jingle.mjs [--prompt <text>] [--length <ms>] [--force]",
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const { prompt, length, force } = parseArgs();
  assertBotBoundJinglePrompt(prompt);
  if (!Number.isInteger(length) || length < 1_000 || length > 30_000) {
    throw new Error("Jingle length must be an integer between 1000 and 30000 milliseconds.");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[generate-jingle] ELEVENLABS_API_KEY not set.");
    console.error("[generate-jingle] Get one from https://elevenlabs.io/app/settings/api-keys");
    console.error(
      "[generate-jingle] Then re-run:  ELEVENLABS_API_KEY=… node scripts/generate-jingle.mjs",
    );
    process.exit(1);
  }

  const fingerprint = jingleFingerprint(prompt, length);

  // Reuse only reviewed audio that was generated from this exact prompt and
  // model. An old or unproven asset must never survive a brand-copy change.
  if (!force) {
    try {
      const info = await stat(BOTBOUND_JINGLE_OUTPUT_PATH);
      if (info.size > 0) {
        if (await audioProvenanceMatches(BOTBOUND_JINGLE_OUTPUT_PATH, fingerprint)) {
          console.log(
            `[generate-jingle] Reviewed jingle matches the current BotBound prompt (${info.size} bytes).`,
          );
          return;
        }
        throw new Error(
          "Jingle exists without a matching prompt fingerprint. Review the BotBound prompt, then regenerate with --force.",
        );
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  console.log("[generate-jingle] Prompt:", prompt);
  console.log("[generate-jingle] Length:", length, "ms");
  console.log("[generate-jingle] Calling ElevenLabs Music API…");

  const t0 = Date.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/music?output_format=${MUSIC_OUTPUT_FORMAT}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: length,
      model_id: MUSIC_MODEL_ID,
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error(`[generate-jingle] ElevenLabs returned ${r.status}:`, errText.slice(0, 500));
    process.exit(1);
  }

  const buf = Buffer.from(await r.arrayBuffer());
  assertGeneratedMp3(buf, r.headers.get("content-type"), "ElevenLabs Music");
  await mkdir(dirname(BOTBOUND_JINGLE_OUTPUT_PATH), { recursive: true });
  await writeFile(BOTBOUND_JINGLE_OUTPUT_PATH, buf);
  await writeAudioProvenance(BOTBOUND_JINGLE_OUTPUT_PATH, fingerprint, buf, {
    prompt,
    length,
    model: MUSIC_MODEL_ID,
    output_format: MUSIC_OUTPUT_FORMAT,
  });
  const elapsedMs = Date.now() - t0;

  console.log(
    `[generate-jingle] Wrote ${BOTBOUND_JINGLE_OUTPUT_PATH} (${buf.length} bytes) in ${elapsedMs}ms.`,
  );
  console.log(
    "[generate-jingle] Review, then commit the MP3 and .sha256 sidecar together before enabling approval.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error("[generate-jingle] Failed:", err?.message || err);
    process.exit(1);
  });
}
