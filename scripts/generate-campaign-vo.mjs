/**
 * Render the launch-campaign voiceover tracks.
 *
 * `docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md` lists three audio deliverables
 * that nothing in the repository produced, so every reel cut had to be scored
 * by hand. This renders them from the canonical scripts in
 * `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`.
 *
 * Output goes to `official-assets/audio/`, which is gitignored and blocked by
 * source-control hygiene on purpose: campaign audio is a build artifact, not
 * repository content. Generate it, use it in the cut, regenerate whenever the
 * campaign copy changes.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=… node scripts/generate-campaign-vo.mjs [--force] [--voice <id>]
 *   XAI_API_KEY=… node scripts/generate-campaign-vo.mjs --engine xai [--force]
 *
 * Engines: `elevenlabs` (default, canonical deliverables) renders with the
 * curated runtime Studio voice. `xai` renders the same scripts through the xAI
 * TTS endpoint (`src/lib/voice/xai-tts-service.ts` documents the request
 * shape) into an `xai/` subfolder as the second creative engine the voice
 * doctrine names — reference/alternate reads, never the canonical files.
 *
 * Every render is duration-verified by walking the MP3 frames. Tracks with a
 * hard ceiling (`maxSeconds`) retry at stepped-up speed until the render fits,
 * because provider pacing drifts between renders even at a fixed speed.
 *
 * Scope: marketing and reference use only. Production phone-call speech goes
 * through the managed voice runtime (src/lib/managed-voice-runtime.ts), never
 * through campaign assets.
 */
import { writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(REPO_ROOT, "official-assets/audio");

/**
 * Warm, direct, unhurried — the doc's "founder explaining to a friend".
 * Deliberately a curated runtime Studio voice (Jessica), so the narration in
 * every reel is a voice customers can actually put on their phone line.
 * Pinned by tests/launch-campaign-vo-contract.test.ts.
 */
export const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const MODEL_ID = "eleven_multilingual_v2";

/**
 * Second-engine default for `--engine xai`: Ara, the provider's "warm and
 * professional" built-in — closest to the guide's founder-explaining tone.
 * The xAI renders are alternates for editing/A-B, never the canonical files.
 */
export const XAI_VOICE_ID = "ara";

/**
 * Canonical voiceover copy, verbatim from the campaign document. Pinned by
 * tests/launch-campaign-vo-contract.test.ts so the script and the document
 * cannot drift apart.
 *
 * The delivery guide targets 2.3-2.5 words per second. Left at speed 1.0 the
 * provider reads noticeably faster than that — measured 2.57 / 2.69 / 3.02 wps
 * across the three cuts — which pushed the founder explainer to 42.7s inside a
 * 60-second slot, i.e. seventeen seconds of dead air. Per-track speed brings
 * each render back onto the guide's pace, which is also the pace the cuts were
 * timecoded against.
 */
export const CAMPAIGN_VO = [
  {
    id: "missed-call-15s",
    file: "wireline-missed-call-15s.mp3",
    targetSeconds: 15,
    // The one track with a hard ceiling: the film is 15.0s and the VO must
    // finish inside it. Provider pacing drifts between renders — speed 1.07
    // measured 15.86s on 2026-08-14 where an earlier render made 14.4s — so
    // the ceiling is enforced by measuring the render and retrying faster
    // (`maxSeconds` below), not by trusting any fixed speed value.
    speed: 1.07,
    maxSeconds: 15,
    text: "Six forty-seven. The phone rings, and you cannot pick up. Your Wireline agent can. It answers, books the next step, texts the confirmation, and logs the outcome. Build free at trywireline.com.",
  },
  {
    id: "ai-voice-agent-30s",
    file: "wireline-ai-voice-agent-30s.mp3",
    targetSeconds: 30,
    // The hero cut hands eight seconds to real captured agent audio and holds a
    // beat of silence, so the narration only has ~10s at the end and must not
    // fill it. Rendered at natural pace: slowing a short script to pad a slot is
    // how narration starts sounding like an announcer.
    speed: 1.0,
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
    // 49 words into a 25s slot is ~2.0 wps at speed 1.0, under the guide's
    // 2.3-2.5 band. That is the intent: the em-dash clause and the two short
    // sentences before the price need air to land, and the cut hands several
    // seconds to the session picture itself. Do not speed this up to "fill"
    // the slot — the silence is where the presenter is on screen.
    speed: 1.0,
    text: "Some conversations deserve a face. Turn on Live Video and your voice agent joins on screen — same training, same rules, same logged outcome as the call it would have taken. One place to review the work. Add it to a live plan for nineteen dollars a month.",
  },
];

/**
 * Apply the document's delivery guide to the written copy.
 * The scripts are written to be read on screen; the guide says to speak the
 * domain rather than spell it, so a narrator does not say "dot com" as "period
 * com" or read the URL as one collapsed word.
 */
export function speakable(text) {
  return text.replace(/trywireline\.com/gi, "try wireline dot com");
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const voiceIndex = argv.indexOf("--voice");
  const engineIndex = argv.indexOf("--engine");
  const engine = engineIndex >= 0 ? argv[engineIndex + 1] : "elevenlabs";
  if (engine !== "elevenlabs" && engine !== "xai") {
    console.error(`[campaign-vo] Unknown engine "${engine}". Use elevenlabs or xai.`);
    process.exit(1);
  }
  return {
    force: argv.includes("--force"),
    engine,
    voiceId: voiceIndex >= 0 ? argv[voiceIndex + 1] : engine === "xai" ? XAI_VOICE_ID : DEFAULT_VOICE_ID,
  };
}

/**
 * Measured duration of a CBR MP3 by walking its frame headers — no ffprobe in
 * the capture sandboxes, and byte-length estimates drift with ID3 padding.
 */
export function mp3DurationSeconds(buffer) {
  const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const RATES = [44100, 48000, 32000];
  let i = 0;
  if (buffer.length > 10 && buffer.slice(0, 3).toString("latin1") === "ID3") {
    const size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    i = 10 + size;
  }
  let seconds = 0;
  while (i + 4 < buffer.length) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      const bitrateIdx = (buffer[i + 2] >> 4) & 0x0f;
      const rateIdx = (buffer[i + 2] >> 2) & 0x03;
      if (bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) {
        i += 1;
        continue;
      }
      const bitrate = BITRATES[bitrateIdx] * 1000;
      const rate = RATES[rateIdx];
      const padding = (buffer[i + 2] >> 1) & 1;
      seconds += 1152 / rate;
      i += Math.floor((1152 * bitrate) / (8 * rate)) + padding;
    } else {
      i += 1;
    }
  }
  return seconds;
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
        model_id: MODEL_ID,
        // The guide asks for an even, unhurried read that leaves air at the
        // ends rather than an announcer performance.
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
  // Request shape mirrors src/lib/voice/xai-tts-service.ts: voice_id +
  // language required, output_format is an object, no model field.
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
      output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 128000 },
      ...(speed && speed !== 1 ? { speed: Math.min(1.5, Math.max(0.7, speed)) } : {}),
      text_normalization: true,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`xAI TTS returned ${response.status}: ${detail}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const { force, engine, voiceId } = parseArgs();
  const apiKey = engine === "xai" ? process.env.XAI_API_KEY : process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    const name = engine === "xai" ? "XAI_API_KEY" : "ELEVENLABS_API_KEY";
    console.error(`[campaign-vo] ${name} not set.`);
    console.error("[campaign-vo] Pull it from Vercel or your local .env, then re-run.");
    process.exit(1);
  }

  const outputDir = engine === "xai" ? resolve(OUTPUT_DIR, "xai") : OUTPUT_DIR;
  const render = engine === "xai" ? renderXai : renderElevenLabs;
  await mkdir(outputDir, { recursive: true });

  for (const track of CAMPAIGN_VO) {
    const outputPath = resolve(outputDir, track.file);
    if (!force) {
      try {
        const info = await stat(outputPath);
        if (info.size > 0) {
          console.log(`[campaign-vo] ${track.file} exists (${info.size} bytes). --force to redo.`);
          continue;
        }
      } catch {
        // Not rendered yet.
      }
    }

    const text = speakable(track.text);
    const words = text.split(/\s+/).filter(Boolean).length;
    console.log(`[campaign-vo] ${track.id}: ${words} words, target ~${track.targetSeconds}s`);

    // Provider pacing drifts render to render, so a hard-ceiling track is
    // measured and retried faster instead of trusting its configured speed.
    const maxAttempts = track.maxSeconds ? 4 : 1;
    let speed = track.speed ?? 1;
    let audio = null;
    let seconds = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      audio = await render({ apiKey, voiceId, text, speed });
      seconds = mp3DurationSeconds(audio);
      const rate = seconds > 0 ? (words / seconds).toFixed(2) : "?";
      console.log(
        `[campaign-vo]   render ${attempt}: ${seconds.toFixed(2)}s at speed ${speed} (${rate} wps)`,
      );
      if (!track.maxSeconds || seconds <= track.maxSeconds) break;
      if (attempt === maxAttempts) {
        console.error(
          `[campaign-vo] ${track.id} still runs ${seconds.toFixed(2)}s after ${maxAttempts} attempts (ceiling ${track.maxSeconds}s).`,
        );
        process.exit(1);
      }
      speed = Math.min(1.2, Math.round((speed + 0.03) * 100) / 100);
    }

    await writeFile(outputPath, audio);
    console.log(`[campaign-vo] wrote ${outputPath} (${audio.length} bytes, ${seconds.toFixed(2)}s)`);
  }

  console.log("[campaign-vo] Done. official-assets/ is gitignored — do not commit the audio.");
}

// Only run when invoked directly, so the contract test can import the copy.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error("[campaign-vo] Failed:", error?.message || error);
    process.exit(1);
  });
}
