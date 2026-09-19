/**
 * Render BotBound's canonical campaign voiceover tracks.
 *
 * Scope: marketing and reference use only. Production phone-call speech uses
 * the managed voice runtime and never reads campaign assets. Generated audio
 * is written under official-assets/audio/, which is intentionally gitignored.
 *
 * Usage:
 *   OPENAI_API_KEY=... node scripts/generate-campaign-vo.mjs [--force] [--voice <id>]
 */
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { audioProvenanceMatches, writeAudioProvenance } from "./lib/audio-provenance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(REPO_ROOT, "official-assets/audio");
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const OPENAI_TTS_FORMAT = "mp3";
const OPENAI_TTS_INSTRUCTIONS =
  "Deliver a polished, warm, assured American-English brand narration. Sound human and conversational, not theatrical. Keep the pacing crisp and preserve every word exactly.";
const DURATION_RETRY_POLICY = { maxAttempts: 4, speedStep: 0.03, maxSpeed: 1.2 };

/** Built-in OpenAI voice shared with the production runtime catalog. */
export const DEFAULT_VOICE_ID = "marin";
const OPENAI_VOICE_IDS = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

/**
 * Canonical copy, kept verbatim in docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md.
 * `targetSeconds` is the edit slot, not an instruction to pad narration.
 */
export const CAMPAIGN_VO = [
  {
    id: "missed-call-15s",
    file: "wireline-missed-call-15s.mp3",
    targetSeconds: 15,
    speed: 1.07,
    maxSeconds: 15,
    text: "Six forty-seven. The phone rings, and you cannot pick up. Your BotBound Bot can. It answers, books the next step, texts the confirmation, and logs the outcome. Build free at botbound.me.",
  },
  {
    id: "ai-voice-agent-30s",
    file: "wireline-ai-voice-agent-30s.mp3",
    targetSeconds: 30,
    speed: 1,
    text: "A Bot trained for your calls, with outcomes you can review. Build free. Plans from nineteen dollars a month. Live setup depends on availability.",
  },
  {
    id: "founder-60s",
    file: "wireline-founder-60s.mp3",
    targetSeconds: 60,
    speed: 0.8,
    text: "I built BotBound because calls are where real work happens, and they are too easy to miss. Build a Bot for your business. Train it on your facts and rules. Test it privately. When your account and number are ready, put it on the line. Connect the tools it needs to book, follow up, or hand off. Review the outcomes and improve its playbook. Front desk, sales, support, or a role you define. Build free at botbound.me. Plans start at nineteen dollars a month. Live setup depends on availability.",
  },
];

export function speakable(text) {
  return text.replace(/botbound\.me/gi, "bot bound dot me");
}

const RETIRED_PUBLIC_BRAND = /\bWireline\b|trywireline\.com/i;

export function assertBotBoundCampaignText(text, id = "campaign track") {
  if (RETIRED_PUBLIC_BRAND.test(text)) {
    throw new Error(`${id} still contains retired public branding.`);
  }
}

export function campaignTrackFingerprint({ track, engine, voiceId }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 3,
        engine,
        voiceId,
        track: {
          id: track.id,
          text: speakable(track.text),
          targetSeconds: track.targetSeconds,
          maxSeconds: track.maxSeconds ?? null,
          baseSpeed: track.speed ?? 1,
        },
        rendering: {
          endpoint: "https://api.openai.com/v1/audio/speech",
          model: OPENAI_TTS_MODEL,
          responseFormat: OPENAI_TTS_FORMAT,
          instructions: OPENAI_TTS_INSTRUCTIONS,
        },
        durationParser: "mpeg-audio-layer3-version-aware-v2",
        retryPolicy: track.maxSeconds ? DURATION_RETRY_POLICY : { maxAttempts: 1 },
      }),
    )
    .digest("hex");
}

export function campaignTrackFingerprintFromProvenance({ track, expectedEngine, provenance }) {
  const voiceId = typeof provenance?.voice_id === "string" ? provenance.voice_id.trim() : "";
  if (provenance?.track_id !== track.id || provenance?.engine !== expectedEngine || !voiceId) {
    throw new Error(`${track.id} provenance does not match its campaign track and engine.`);
  }
  return campaignTrackFingerprint({ track, engine: expectedEngine, voiceId });
}

/**
 * Measure an MPEG Audio Layer III stream by walking every contiguous frame.
 * OpenAI may return MPEG-1, MPEG-2, or MPEG-2.5 and may vary bitrate between
 * frames, so version-specific sample rates, bitrate tables, samples/frame, and
 * frame-length coefficients are all resolved from each header. This keeps the
 * release gate self-contained without undercounting valid lower-version MP3s.
 */
export function mp3DurationSeconds(buffer) {
  const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Layer3Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRatesByVersion = {
    3: [44_100, 48_000, 32_000],
    2: [22_050, 24_000, 16_000],
    0: [11_025, 12_000, 8_000],
  };
  let offset = 0;

  if (buffer.length > 10 && buffer.subarray(0, 3).toString("latin1") === "ID3") {
    const tagSize =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + tagSize;
  }

  let seconds = 0;
  let frameCount = 0;
  let foundFirstFrame = false;
  while (offset + 4 < buffer.length) {
    const sync = buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0;
    if (!sync) {
      if (foundFirstFrame) break;
      offset += 1;
      continue;
    }

    const version = (buffer[offset + 1] >> 3) & 0x03;
    const layer = (buffer[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
    if (
      version === 1 ||
      layer !== 1 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15 ||
      sampleRateIndex === 3
    ) {
      if (foundFirstFrame) break;
      offset += 1;
      continue;
    }

    const bitrateTable = version === 3 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates;
    const sampleRateTable = sampleRatesByVersion[version];
    const bitrate = bitrateTable[bitrateIndex] * 1000;
    const sampleRate = sampleRateTable[sampleRateIndex];
    const samplesPerFrame = version === 3 ? 1152 : 576;
    const frameLengthCoefficient = version === 3 ? 144 : 72;
    const padding = (buffer[offset + 2] >> 1) & 1;
    const frameLength = Math.floor((frameLengthCoefficient * bitrate) / sampleRate) + padding;
    if (frameLength < 4 || offset + frameLength > buffer.length) break;

    foundFirstFrame = true;
    frameCount += 1;
    seconds += samplesPerFrame / sampleRate;
    offset += frameLength;
  }

  return frameCount >= 2 ? seconds : 0;
}

export function assertGeneratedMp3(buffer, contentType, label = "Generated audio") {
  const mimeType = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mimeType !== "audio/mpeg" && mimeType !== "audio/mp3") {
    throw new Error(`${label} returned ${mimeType || "no content type"}, not MP3 audio.`);
  }
  if (!Buffer.isBuffer(buffer) || buffer.length < 1_024) {
    throw new Error(`${label} returned an implausibly small MP3 payload.`);
  }
  const seconds = mp3DurationSeconds(buffer);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`${label} returned no valid MP3 frames.`);
  }
  return seconds;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const engineIndex = argv.indexOf("--engine");
  const voiceIndex = argv.indexOf("--voice");
  const engine = engineIndex >= 0 ? argv[engineIndex + 1] : "openai";
  const voiceId = voiceIndex >= 0 ? argv[voiceIndex + 1] : DEFAULT_VOICE_ID;
  if (engine !== "openai") {
    throw new Error(`Unknown engine "${engine}". BotBound campaign speech uses OpenAI only.`);
  }
  if (!OPENAI_VOICE_IDS.has(voiceId)) {
    throw new Error(
      `Unknown OpenAI voice "${voiceId}". Choose one of: ${[...OPENAI_VOICE_IDS].join(", ")}.`,
    );
  }

  return {
    engine,
    force: argv.includes("--force"),
    voiceId,
  };
}

async function renderOpenAI({ apiKey, voiceId, text, speed }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      input: text,
      voice: voiceId,
      response_format: OPENAI_TTS_FORMAT,
      instructions: OPENAI_TTS_INSTRUCTIONS,
      speed,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`OpenAI TTS returned ${response.status}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  assertGeneratedMp3(audio, response.headers.get("content-type"), "OpenAI TTS");
  return audio;
}

async function outputExists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function renderTrack({ track, render, apiKey, voiceId }) {
  const text = speakable(track.text);
  const words = text.split(/\s+/).filter(Boolean).length;
  const maxAttempts = track.maxSeconds ? DURATION_RETRY_POLICY.maxAttempts : 1;
  let speed = track.speed ?? 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const audio = await render({ apiKey, voiceId, text, speed });
    const seconds = mp3DurationSeconds(audio);
    const wordsPerSecond = seconds > 0 ? (words / seconds).toFixed(2) : "?";
    console.log(
      `[campaign-vo] ${track.id} render ${attempt}: ${seconds.toFixed(2)}s at speed ${speed} (${wordsPerSecond} wps)`,
    );

    if (!track.maxSeconds || seconds <= track.maxSeconds) {
      return { audio, seconds };
    }

    if (attempt === maxAttempts) {
      throw new Error(
        `${track.id} still runs ${seconds.toFixed(2)}s after ${maxAttempts} attempts (ceiling ${track.maxSeconds}s).`,
      );
    }

    speed = Math.min(
      DURATION_RETRY_POLICY.maxSpeed,
      Math.round((speed + DURATION_RETRY_POLICY.speedStep) * 100) / 100,
    );
  }

  throw new Error(`${track.id} could not be rendered.`);
}

async function main() {
  const { engine, force, voiceId } = parseArgs();
  for (const track of CAMPAIGN_VO) assertBotBoundCampaignText(track.text, track.id);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const outputDir = OUTPUT_DIR;
  const render = renderOpenAI;
  await mkdir(outputDir, { recursive: true });

  for (const track of CAMPAIGN_VO) {
    const outputPath = resolve(outputDir, track.file);
    const fingerprint = campaignTrackFingerprint({ track, engine, voiceId });
    if (!force && (await outputExists(outputPath))) {
      if (await audioProvenanceMatches(outputPath, fingerprint)) {
        console.log(`[campaign-vo] ${track.file} matches current copy; reusing it.`);
        continue;
      }
      throw new Error(
        `${track.file} exists without a matching copy fingerprint. Review the current BotBound script, then regenerate with --force.`,
      );
    }

    const { audio, seconds } = await renderTrack({ track, render, apiKey, voiceId });
    await writeFile(outputPath, audio);
    await writeAudioProvenance(outputPath, fingerprint, audio, {
      track_id: track.id,
      engine,
      voice_id: voiceId,
    });
    console.log(
      `[campaign-vo] wrote ${outputPath} (${audio.length} bytes, ${seconds.toFixed(2)}s)`,
    );
  }

  console.log("[campaign-vo] Done. official-assets/ is gitignored; do not commit generated audio.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error("[campaign-vo] Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
