/**
 * Render Wireline's canonical campaign voiceover tracks.
 *
 * Scope: marketing and reference use only. Production phone-call speech uses
 * the managed voice runtime and never reads campaign assets. Generated audio
 * is written under official-assets/audio/, which is intentionally gitignored.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node scripts/generate-campaign-vo.mjs [--force] [--voice <id>]
 *   XAI_API_KEY=... node scripts/generate-campaign-vo.mjs --engine xai [--force]
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(REPO_ROOT, "official-assets/audio");
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

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
    text: "Six forty-seven. The phone rings, and you cannot pick up. Your Wireline agent can. It answers, books the next step, texts the confirmation, and logs the outcome. Build free at trywireline.com.",
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
    text: "I built Wireline because the phone call is still where real business happens, and it is still the easiest thing to miss. Every missed call is a customer deciding to try the next name on the list. So we made it simple to build a voice agent of your own. Train it on your facts and rules in plain language. Let it practice in private simulation. Only then does it touch a real number. From that moment it answers your calls, sends the follow-up text or email, and logs every outcome so you can check its work. Personal line or front desk. One agent, or a team when volume proves the need. Build free. Go live from nineteen dollars a month, with a Wireline number included on every paid plan.",
  },
  {
    id: "live-video-25s",
    file: "wireline-live-video-25s.mp3",
    targetSeconds: 25,
    speed: 1,
    text: "Some conversations deserve a face. Turn on Live Video and your voice agent joins on screen using the same Training, operating rules, and approved knowledge. Add it to a paid business agent for nineteen dollars a month.",
  },
];

export function speakable(text) {
  return text.replace(/trywireline\.com/gi, "try wireline dot com");
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
      voiceIndex >= 0
        ? argv[voiceIndex + 1]
        : engine === "xai"
          ? XAI_VOICE_ID
          : DEFAULT_VOICE_ID,
  };
}

async function renderElevenLabs({ apiKey, voiceId, text, speed }) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
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
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          speed,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`ElevenLabs returned ${response.status}: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
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
      output_format: { codec: "mp3", sample_rate: 44_100, bit_rate: 128_000 },
      ...(speed !== 1 ? { speed: Math.min(1.5, Math.max(0.7, speed)) } : {}),
      text_normalization: true,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`xAI TTS returned ${response.status}: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
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
  const maxAttempts = track.maxSeconds ? 4 : 1;
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

    speed = Math.min(1.2, Math.round((speed + 0.03) * 100) / 100);
  }

  throw new Error(`${track.id} could not be rendered.`);
}

async function main() {
  const { engine, force, voiceId } = parseArgs();
  const apiKey = engine === "xai" ? process.env.XAI_API_KEY : process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(`${engine === "xai" ? "XAI_API_KEY" : "ELEVENLABS_API_KEY"} is not set.`);
  }

  const outputDir = engine === "xai" ? resolve(OUTPUT_DIR, "xai") : OUTPUT_DIR;
  const render = engine === "xai" ? renderXai : renderElevenLabs;
  await mkdir(outputDir, { recursive: true });

  for (const track of CAMPAIGN_VO) {
    const outputPath = resolve(outputDir, track.file);
    if (!force && (await outputExists(outputPath))) {
      console.log(`[campaign-vo] ${track.file} exists. Use --force to regenerate.`);
      continue;
    }

    const { audio, seconds } = await renderTrack({ track, render, apiKey, voiceId });
    await writeFile(outputPath, audio);
    console.log(`[campaign-vo] wrote ${outputPath} (${audio.length} bytes, ${seconds.toFixed(2)}s)`);
  }

  console.log("[campaign-vo] Done. official-assets/ is gitignored; do not commit generated audio.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error("[campaign-vo] Failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
