#!/usr/bin/env node
/**
 * Pre-bake the Wireline singing-receptionist jingle.
 *
 * Wireline's /showcase page features a "fun" demo agent (Mira) that
 * sings the moment a caller connects, then catches itself with a
 * normal greeting. The jingle is one-time-generated and committed
 * under public/sounds — we don't pay ElevenLabs per visitor, and
 * the demo line has zero pre-roll latency.
 *
 * Provenance: the currently committed MP3 was rendered 2026-08-01 with
 * ElevenLabs TTS (eleven_v3, expressive singing delivery, voice
 * "Jessica"). This script remains the canonical regeneration path via
 * the ElevenLabs Music API for a fully produced track; either output
 * ships the same way — review the audio, then commit the static file.
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
 *   public/sounds/wireline-jingle.mp3
 *
 * Cost: ~$0.02 per second of generated audio (≈ $0.16 for an 8s
 * jingle). One-time spend — commit the MP3 afterwards so prod
 * deploys serve it from the static asset path.
 *
 * Do not regenerate this through a production admin route.
 * Vercel's filesystem is ephemeral; run this script locally,
 * review the MP3, then commit the static asset so every deployment
 * serves the same file.
 *
 */
import { writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(REPO_ROOT, "public/sounds/wireline-jingle.mp3");

const DEFAULT_PROMPT =
  "Upbeat playful jingle, female voice singing 'Welcome to Wireline, your phones are alive! Call us anytime, day or night!' — pop style, 8 seconds.";
const DEFAULT_LENGTH_MS = 8000;

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
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[generate-jingle] ELEVENLABS_API_KEY not set.");
    console.error("[generate-jingle] Get one from https://elevenlabs.io/app/settings/api-keys");
    console.error(
      "[generate-jingle] Then re-run:  ELEVENLABS_API_KEY=… node scripts/generate-jingle.mjs",
    );
    process.exit(1);
  }

  const { prompt, length, force } = parseArgs();

  // Idempotency guard — refuse to overwrite a committed jingle unless --force.
  if (!force) {
    try {
      const info = await stat(OUTPUT_PATH);
      if (info.size > 0) {
        console.log(
          `[generate-jingle] Jingle already exists at ${OUTPUT_PATH} (${info.size} bytes).`,
        );
        console.log("[generate-jingle] Pass --force to regenerate.");
        process.exit(0);
      }
    } catch {
      // ENOENT → first run, fall through.
    }
  }

  console.log("[generate-jingle] Prompt:", prompt);
  console.log("[generate-jingle] Length:", length, "ms");
  console.log("[generate-jingle] Calling ElevenLabs Music API…");

  const t0 = Date.now();
  const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: length,
      model_id: "music_v1",
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error(`[generate-jingle] ElevenLabs returned ${r.status}:`, errText.slice(0, 500));
    process.exit(1);
  }

  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, buf);
  const elapsedMs = Date.now() - t0;

  console.log(`[generate-jingle] Wrote ${OUTPUT_PATH} (${buf.length} bytes) in ${elapsedMs}ms.`);
  console.log("[generate-jingle] Commit + push so the jingle ships with the next deploy.");
}

main().catch((err) => {
  console.error("[generate-jingle] Failed:", err?.message || err);
  process.exit(1);
});
