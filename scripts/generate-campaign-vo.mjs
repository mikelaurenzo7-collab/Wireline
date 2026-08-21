/**
 * Render BotBound's canonical campaign voiceover tracks.
 *
 * Scope: marketing and reference use only. Production phone-call speech uses
 * the managed voice runtime and never reads campaign assets. Generated audio
 * is written under official-assets/audio/, which is intentionally gitignored.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node scripts/generate-campaign-vo.mjs [--force] [--voice <id>]
 *   XAI_API_KEY=... node scripts/generate-campaign-vo.mjs --engine xai [--force]
 */
import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { audioProvenanceMatches, writeAudioProvenance } from "./lib/audio-provenance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(REPO_ROOT, "official-assets/audio");
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0,
  use_speaker_boost: true,
};
const XAI_OUTPUT_FORMAT = { codec: "mp3", sample_rate: 44_100, bit_rate: 128_000 };
const DURATION_RETRY_POLICY = { maxAttempts: 4, speedStep: 0.03, maxSpeed: 1.2 };

/** Curated Studio voice that customers can also use on the production runtime. */
export const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9";
/** Warm built-in xAI voice for alternate/reference reads. */
export const XAI_VOICE_ID = "ara";

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
    text: "Every call answered the way you trained it, and logged where you can check the work. Build free. Go live from nineteen dollars a month.",
  },
  {
    id: "founder-60s",
    file: "wireline-founder-60s.mp3",
    targetSeconds: 60,
    speed: 0.8,
    text: "I built BotBound because calls are still where real work happens, and they are still too easy to miss. Every missed call is a customer deciding to try the next name on the list. So we made it simple to build a Bot of your own. Train it on your facts and rules in plain language. Let it practice in private simulation. Only then does it touch a real number. From that moment it answers your calls, sends the follow-up text or email, and logs every outcome so you can check its work. Front desk, sales, support, or any role you define. One Bot, or a team when volume proves the need. Build free. Go live from nineteen dollars a month, with a dedicated production number for every active paid Bot.",
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
        version: 2,
        engine,
        voiceId,
        track: {
          id: track.id,
          text: speakable(track.text),
          targetSeconds: track.targetSeconds,
          maxSeconds: track.maxSeconds ?? null,
          baseSpeed: track.speed ?? 1,
        },
        rendering:
          engine === "xai"
            ? {
                endpoint: "https://api.x.ai/v1/tts",
                language: "en",
                outputFormat: XAI_OUTPUT_FORMAT,
                textNormalization: true,
              }
            : {
                model: ELEVENLABS_MODEL_ID,
                outputFormat: ELEVENLABS_OUTPUT_FORMAT,
                voiceSettings: ELEVENLABS_VOICE_SETTINGS,
              },
        durationParser: "mpeg1-layer3-cbr-v1",
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
 * Measure an MPEG-1 Layer III CBR stream by walking frame headers. This keeps
 * campaign generation self-contained in environments without ffprobe.
 */
export function mp3DurationSeconds(buffer) {
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const sampleRates = [44_100, 48_000, 32_000];
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
  while (offset + 4 < buffer.length) {
    const sync = buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0;
    if (!sync) {
      offset += 1;
      continue;
    }

    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
    if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
      offset += 1;
      continue;
    }

    const bitrate = bitrates[bitrateIndex] * 1000;
    const sampleRate = sampleRates[sampleRateIndex];
    const padding = (buffer[offset + 2] >> 1) & 1;
    seconds += 1152 / sampleRate;
    offset += Math.floor((1152 * bitrate) / (8 * sampleRate)) + padding;
  }

  return seconds;
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
  const engine = engineIndex >= 0 ? argv[engineIndex + 1] : "elevenlabs";

  if (engine !== "elevenlabs" && engine !== "xai") {
    throw new Error(`Unknown engine "${engine}". Use elevenlabs or xai.`);
  }

  return {
    engine,
    force: argv.includes("--force"),
    voiceId:
      voiceIndex >= 0 ? argv[voiceIndex + 1] : engine === "xai" ? XAI_VOICE_ID : DEFAULT_VOICE_ID,
  };
}

async function renderElevenLabs({ apiKey, voiceId, text, speed }) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${ELEVENLABS_OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          ...ELEVENLABS_VOICE_SETTINGS,
          speed,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`ElevenLabs returned ${response.status}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  assertGeneratedMp3(audio, response.headers.get("content-type"), "ElevenLabs TTS");
  return audio;
}

async function renderXai({ apiKey, voiceId, text, speed }) {
  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: "en",
      output_format: XAI_OUTPUT_FORMAT,
      ...(speed !== 1 ? { speed: Math.min(1.5, Math.max(0.7, speed)) } : {}),
      text_normalization: true,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`xAI TTS returned ${response.status}: ${detail}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  assertGeneratedMp3(audio, response.headers.get("content-type"), "xAI TTS");
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
  const apiKey = engine === "xai" ? process.env.XAI_API_KEY : process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(`${engine === "xai" ? "XAI_API_KEY" : "ELEVENLABS_API_KEY"} is not set.`);
  }

  const outputDir = engine === "xai" ? resolve(OUTPUT_DIR, "xai") : OUTPUT_DIR;
  const render = engine === "xai" ? renderXai : renderElevenLabs;
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
