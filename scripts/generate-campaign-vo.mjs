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

/** Warm, direct, unhurried — the doc's "founder explaining to a friend". */
const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9";
const MODEL_ID = "eleven_multilingual_v2";

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
    // Already lands at 14.4s; the 15s cut has no room to slow down.
    speed: 1.0,
    text: "Six forty-seven. The phone rings, and you cannot pick up. Your Wireline agent can. It answers, books the next step, texts the confirmation, and logs the outcome. Build free at trywireline.com.",
  },
  {
    id: "ai-voice-agent-30s",
    file: "wireline-ai-voice-agent-30s.mp3",
    targetSeconds: 30,
    speed: 0.9,
    text: "This is Wireline. Create an agent for your personal line or your front desk. Train it on your facts, your tone, your rules, and what it must never say. Wire it to a real number, texts, and email. Then run it: every call answered, every follow-up sent, every outcome logged where you can check it. Build free. Test it privately. Go live from nineteen dollars a month.",
  },
  {
    id: "founder-60s",
    file: "wireline-founder-60s.mp3",
    targetSeconds: 60,
    speed: 0.8,
    text: "I built Wireline because the phone call is still where real business happens, and it is still the easiest thing to miss. Every missed call is a customer deciding to try the next name on the list. So we made it simple to build a voice agent of your own. Train it on your facts and rules in plain language. Let it practice in private simulation. Only then does it touch a real number. From that moment it answers your calls, sends the follow-up text or email, and logs every outcome so you can check its work. Personal line or front desk. One agent, or a team when volume proves the need. Build free. Go live from nineteen dollars a month, with a Wireline number included on every paid plan.",
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
  return {
    force: argv.includes("--force"),
    voiceId: voiceIndex >= 0 ? argv[voiceIndex + 1] : DEFAULT_VOICE_ID,
  };
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[campaign-vo] ELEVENLABS_API_KEY not set.");
    console.error("[campaign-vo] Pull it from Vercel or your local .env, then re-run.");
    process.exit(1);
  }

  const { force, voiceId } = parseArgs();
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const track of CAMPAIGN_VO) {
    const outputPath = resolve(OUTPUT_DIR, track.file);
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
            speed: track.speed ?? 1,
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      console.error(`[campaign-vo] ElevenLabs returned ${response.status}: ${detail}`);
      process.exit(1);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, audio);
    console.log(`[campaign-vo] wrote ${outputPath} (${audio.length} bytes)`);
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
