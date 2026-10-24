/**
 * Pure, isomorphic quality check for a live-voice reference recording. The
 * browser runs it before upload to coach the speaker; the server runs it
 * again so a bad clip never becomes a voice. Only aggregate numbers are kept.
 */
export const LIVE_VOICE_MIN_SECONDS = 10;
export const LIVE_VOICE_GOOD_SECONDS = 30;
export const LIVE_VOICE_RECOMMENDED_SECONDS = 90;
export const LIVE_VOICE_MAX_SECONDS = 120;
/** 120 s of 24 kHz mono PCM16 is ~5.8 MB; the upload is raw WAV, not base64. */
export const LIVE_VOICE_MAX_BYTES = 5_900_000;
export const LIVE_VOICE_SAMPLE_RATES = [16_000, 22_050, 24_000, 44_100, 48_000] as const;
/** Below this the clone is refused with coaching instead of producing a poor voice. */
export const LIVE_VOICE_MIN_QUALITY_SCORE = 45;

export type LiveVoiceCoachingTip =
  | "too_short"
  | "short_but_ok"
  | "too_quiet"
  | "too_loud"
  | "clipping"
  | "long_silences"
  | "noisy_room";

export type LiveVoiceQualityReport = {
  durationSeconds: number;
  sampleRateHz: number;
  rmsDbfs: number;
  peakDbfs: number;
  clippingRatio: number;
  silenceRatio: number;
  noiseFloorDbfs: number;
  score: number;
  verdict: "great" | "good" | "retake";
  tips: LiveVoiceCoachingTip[];
};

/** Friendly, vendor-neutral coaching shown next to the meter and in errors. */
export const LIVE_VOICE_COACHING_COPY: Record<LiveVoiceCoachingTip, string> = {
  too_short: "Keep going — read at least 10 seconds. About 90 seconds sounds most like you.",
  short_but_ok: "That works. Reading closer to 90 seconds captures more of your natural style.",
  too_quiet: "We could barely hear you. Move a little closer to the mic or speak up a touch.",
  too_loud: "That's a bit hot. Lean back slightly so your voice doesn't distort.",
  clipping: "Some words distorted. Lean back a few inches and try that part again.",
  long_silences:
    "There were long pauses. Keep a relaxed, steady pace — like talking to a customer.",
  noisy_room: "We picked up background noise. A quieter, softer room makes a cleaner voice.",
};

function dbfs(value: number): number {
  return value > 0 ? Math.max(-100, 20 * Math.log10(value)) : -100;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Locate fmt/data in a PCM16 mono WAV. Throws on anything else. */
export function readPcm16MonoWav(bytes: Uint8Array): { sampleRateHz: number; samples: Int16Array } {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 44 ||
    bytes.byteLength > LIVE_VOICE_MAX_BYTES
  )
    throw new Error("invalid_wav");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("invalid_wav");
  let offset = 12;
  let sampleRateHz = 0;
  let chunks = 0;
  while (offset + 8 <= bytes.byteLength && chunks++ < 64) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.byteLength) throw new Error("invalid_wav");
    if (id === "fmt ") {
      if (size < 16) throw new Error("invalid_wav");
      const format = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true);
      const bits = view.getUint16(start + 14, true);
      sampleRateHz = view.getUint32(start + 4, true);
      if (format !== 1 || channels !== 1 || bits !== 16) throw new Error("invalid_wav");
      if (!(LIVE_VOICE_SAMPLE_RATES as readonly number[]).includes(sampleRateHz))
        throw new Error("invalid_wav");
    } else if (id === "data") {
      if (!sampleRateHz || size % 2 !== 0) throw new Error("invalid_wav");
      const samples = new Int16Array(size / 2);
      for (let index = 0; index < samples.length; index++)
        samples[index] = view.getInt16(start + index * 2, true);
      return { sampleRateHz, samples };
    }
    offset = start + size + (size % 2);
  }
  throw new Error("invalid_wav");
}

/** Score a recording 0-100 and explain what to fix. */
export function analyzeLiveVoiceRecording(
  samples: Int16Array | Float32Array,
  sampleRateHz: number,
): LiveVoiceQualityReport {
  const toUnit = samples instanceof Int16Array ? 1 / 32768 : 1;
  const durationSeconds = samples.length / sampleRateHz;
  const windowSize = Math.max(1, Math.round(sampleRateHz * 0.05));
  let sumSquares = 0;
  let peak = 0;
  let clipped = 0;
  const windowRms: number[] = [];
  let windowSum = 0;
  let inWindow = 0;
  for (let index = 0; index < samples.length; index++) {
    const value = Math.abs(samples[index] * toUnit);
    sumSquares += value * value;
    windowSum += value * value;
    if (value > peak) peak = value;
    if (value >= 0.985) clipped += 1;
    if (++inWindow === windowSize) {
      windowRms.push(Math.sqrt(windowSum / inWindow));
      windowSum = 0;
      inWindow = 0;
    }
  }
  if (inWindow) windowRms.push(Math.sqrt(windowSum / inWindow));
  const rms = samples.length ? Math.sqrt(sumSquares / samples.length) : 0;
  const sorted = [...windowRms].sort((a, b) => a - b);
  const noiseFloor = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
  const speechLevel = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
  const silenceThreshold = Math.max(0.006, speechLevel * 0.1);
  const silent = windowRms.filter((value) => value < silenceThreshold).length;
  const silenceRatio = windowRms.length ? silent / windowRms.length : 1;
  const clippingRatio = samples.length ? clipped / samples.length : 0;
  const rmsDbfs = dbfs(rms);
  const noiseFloorDbfs = dbfs(noiseFloor);
  const snrDb = dbfs(speechLevel) - noiseFloorDbfs;

  const tips: LiveVoiceCoachingTip[] = [];
  let score = 100;
  if (durationSeconds < LIVE_VOICE_MIN_SECONDS) {
    tips.push("too_short");
    score -= 60;
  } else if (durationSeconds < LIVE_VOICE_GOOD_SECONDS) {
    tips.push("short_but_ok");
    score -= 15;
  } else if (durationSeconds < 60) {
    score -= 5;
  }
  if (rmsDbfs < -38) {
    tips.push("too_quiet");
    score -= rmsDbfs < -48 ? 45 : 25;
  } else if (rmsDbfs > -8) {
    tips.push("too_loud");
    score -= 15;
  }
  if (clippingRatio > 0.002) {
    tips.push("clipping");
    score -= clippingRatio > 0.01 ? 35 : 20;
  }
  if (silenceRatio > 0.45) {
    tips.push("long_silences");
    score -= silenceRatio > 0.65 ? 30 : 15;
  }
  if (noiseFloorDbfs > -45 && snrDb < 20) {
    tips.push("noisy_room");
    score -= snrDb < 12 ? 30 : 15;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict =
    score >= 80
      ? "great"
      : score >= LIVE_VOICE_MIN_QUALITY_SCORE && durationSeconds >= LIVE_VOICE_MIN_SECONDS
        ? "good"
        : "retake";
  return {
    durationSeconds: round(durationSeconds, 2),
    sampleRateHz,
    rmsDbfs: round(rmsDbfs),
    peakDbfs: round(dbfs(peak)),
    clippingRatio: round(clippingRatio, 4),
    silenceRatio: round(silenceRatio, 3),
    noiseFloorDbfs: round(noiseFloorDbfs),
    score,
    verdict,
    tips,
  };
}

/** A natural, phone-shaped read: greetings, a hold, a fix, a sign-off. */
export const LIVE_VOICE_SCRIPT: readonly string[] = [
  "Hi, thanks for calling! You've reached the front desk — how can I help you today?",
  "Sure, I can take care of that for you. Can I get your name and the best number to reach you?",
  "Great, thanks. Give me just one second while I pull that up.",
  "Okay, I see it here. It looks like the earliest opening is Tuesday at ten, or Thursday right after lunch. Which works better for you?",
  "Perfect, you're all set. You'll get a text confirmation in a minute or two.",
  "If anything changes, just call or text this number and we'll move it around — no problem at all.",
  "Oh, and one quick tip: parking is right out front, and the entrance is next to the coffee shop.",
  "Is there anything else I can help you with while I have you?",
  "Alright then. Thanks so much for calling, and have a wonderful rest of your day!",
];
