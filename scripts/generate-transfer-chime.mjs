#!/usr/bin/env node
/**
 * Pre-bake the Wireline transfer chime.
 *
 * The Twilio failover TwiML (src/routes/twilio-webhook-base.ts) plays a
 * short brand chime before dialing the human fallback number. Like the
 * showcase jingle, the asset is one-time-generated and committed under
 * public/sounds so production serves a static file with zero runtime
 * dependencies.
 *
 * Unlike the jingle this needs no vendor at all: the chime is pure
 * synthesis. Rendering is fully deterministic (no randomness, no
 * timestamps), so re-running the script always reproduces the exact
 * committed bytes.
 *
 * Usage:
 *   node scripts/generate-transfer-chime.mjs [--force]
 *
 * Output:
 *   public/sounds/wireline-transfer-chime.wav
 *   (16-bit PCM mono at 8 kHz, the PSTN-native format Twilio <Play>
 *   serves without transcoding artifacts.)
 *
 * Design: an ascending D5 -> A5 "ding-dong" with soft attacks, gentle
 * octave partials, and an exponential release. Warm, brief, and calm --
 * a hold cue, not an alarm.
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "..", "public/sounds/wireline-transfer-chime.wav");

const SAMPLE_RATE = 8000;
const DURATION_S = 1.7;
const PEAK = 0.78; // ~ -2.2 dBFS headroom so carrier-side processing never clips.

/** One struck-bell voice: raised-cosine attack, exponential release, soft partials. */
function bell(t, start, freq, tau) {
  const local = t - start;
  if (local < 0) return 0;
  const attack = Math.min(1, local / 0.024);
  const env = (attack < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * attack) : 1) * Math.exp(-local / tau);
  const w = 2 * Math.PI * freq * local;
  return env * (Math.sin(w) + 0.35 * Math.sin(2 * w) + 0.12 * Math.sin(3 * w));
}

const total = Math.round(SAMPLE_RATE * DURATION_S);
const samples = new Float64Array(total);
for (let i = 0; i < total; i++) {
  const t = i / SAMPLE_RATE;
  samples[i] = bell(t, 0, 587.33, 0.32) + bell(t, 0.28, 880, 0.38);
  // Final-tail fade guarantees the file ends at true silence.
  const remaining = DURATION_S - t;
  if (remaining < 0.08) samples[i] *= remaining / 0.08;
}

let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
const gain = peak > 0 ? PEAK / peak : 0;

const pcm = Buffer.alloc(total * 2);
for (let i = 0; i < total; i++) {
  pcm.writeInt16LE(Math.round(samples[i] * gain * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16); // PCM fmt chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

if (existsSync(OUTPUT_PATH) && !process.argv.includes("--force")) {
  console.log(`[transfer-chime] ${OUTPUT_PATH} already exists. Pass --force to regenerate.`);
  process.exit(0);
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, Buffer.concat([header, pcm]));
console.log(
  `[transfer-chime] Wrote ${OUTPUT_PATH} (${header.length + pcm.length} bytes, ${DURATION_S}s @ ${SAMPLE_RATE} Hz).`,
);
console.log("[transfer-chime] Commit the WAV so every deployment serves the same file.");
