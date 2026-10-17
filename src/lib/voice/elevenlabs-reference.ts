/** Server-only, bounded PCM recording preparation for an explicit ElevenLabs upload. */
import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";

import { inspectPcm16MonoWav, type Pcm16MonoWavMetadata } from "./voice-reference-audio";

export const ELEVENLABS_REFERENCE_MAX_BYTES = 6_000_000;
export const ELEVENLABS_REFERENCE_MIN_SECONDS = 10;
export const ELEVENLABS_REFERENCE_MAX_SECONDS = 120;
export const ELEVENLABS_REFERENCE_SAMPLE_RATES = [16_000, 22_050, 24_000, 44_100, 48_000] as const;
export const ELEVENLABS_REFERENCE_ASSESSMENT_VERSION = "elevenlabs-pcm-signal-v1-2026-10-17";

// Diagnostic thresholds describe signal amplitude only, never speech or speaker identity.
export const ELEVENLABS_REFERENCE_SIGNAL_LIMITS = {
  maxChunks: 128,
  flatlinePeakToPeakPcm: 1,
  nearSilenceCenteredRmsDbfs: -50,
  nonQuietSamplePcm: 128,
  minNonQuietSampleFraction: 0.01,
  clippingMagnitudePcm: 32_760,
  clippingWarningFraction: 0.001,
  dcOffsetWarningMagnitude: 0.02,
} as const;

type ErrorCode = "INVALID_AUDIO" | "SILENT_AUDIO" | "INVALID_FINGERPRINT" | "FINGERPRINT_MISMATCH";

export class ElevenLabsReferenceError extends Error {
  constructor(readonly code: ErrorCode) {
    super(
      code === "SILENT_AUDIO"
        ? "This recording has no usable signal variation. Record your voice again."
        : code === "FINGERPRINT_MISMATCH"
          ? "The recording changed. Review it again before uploading."
          : code === "INVALID_FINGERPRINT"
            ? "The recording fingerprint is invalid."
            : "Use a mono PCM16 WAV recording between 10 and 120 seconds, up to 6 MB.",
    );
    this.name = "ElevenLabsReferenceError";
  }
}

export type ElevenLabsReferenceSignalAssessment = {
  version: typeof ELEVENLABS_REFERENCE_ASSESSMENT_VERSION;
  peak: number;
  rmsDbfs: number | null;
  centeredRmsDbfs: number | null;
  dcOffset: number;
  nonQuietSampleFraction: number;
  clippedSampleFraction: number;
  warnings: Array<"near_silence" | "clipping" | "dc_offset">;
};

export type ElevenLabsReferenceMetadata = Pcm16MonoWavMetadata & {
  /** SHA-256 of the exact bytes validated; never trust a browser-supplied digest alone. */
  sha256: string;
  signal: ElevenLabsReferenceSignalAssessment;
};

export function validateElevenLabsReferenceFingerprint(value: unknown): string {
  if (typeof value !== "string" || value.length !== 64 || !/^[0-9a-f]{64}$/.test(value))
    throw new ElevenLabsReferenceError("INVALID_FINGERPRINT");
  return value;
}

/** Called only after the shared parser established valid bounds and a single data chunk. */
function dataRange(bytes: Uint8Array): { start: number; length: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  for (let chunks = 0; chunks < ELEVENLABS_REFERENCE_SIGNAL_LIMITS.maxChunks; chunks++) {
    if (offset + 8 > bytes.byteLength) break;
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length + (length % 2) > bytes.byteLength) break;
    if (
      bytes[offset] === 100 &&
      bytes[offset + 1] === 97 &&
      bytes[offset + 2] === 116 &&
      bytes[offset + 3] === 97
    )
      return { start, length };
    offset = start + length + (length % 2);
  }
  throw new ElevenLabsReferenceError("INVALID_AUDIO");
}

function decibels(amplitude: number): number | null {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : null;
}

function assessSignal(bytes: Uint8Array, start: number, sampleCount: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, sampleCount * 2);
  let sum = 0;
  let sumSquares = 0;
  let minimum = 32_767;
  let maximum = -32_768;
  let nonQuiet = 0;
  let clipped = 0;
  const limits = ELEVENLABS_REFERENCE_SIGNAL_LIMITS;
  // At most 2,999,978 samples under the byte cap; no decoding or native audio libraries.
  for (let index = 0; index < sampleCount; index++) {
    const sample = view.getInt16(index * 2, true);
    const magnitude = Math.abs(sample);
    sum += sample;
    sumSquares += sample * sample;
    minimum = Math.min(minimum, sample);
    maximum = Math.max(maximum, sample);
    if (magnitude >= limits.nonQuietSamplePcm) nonQuiet++;
    if (magnitude >= limits.clippingMagnitudePcm) clipped++;
  }
  // A constant DC value is a flatline too. Near-silence alone remains a warning.
  if (maximum - minimum <= limits.flatlinePeakToPeakPcm)
    throw new ElevenLabsReferenceError("SILENT_AUDIO");
  const mean = sum / sampleCount;
  const rms = Math.sqrt(sumSquares / sampleCount) / 32_768;
  const centeredRms = Math.sqrt(Math.max(0, sumSquares / sampleCount - mean * mean)) / 32_768;
  const centeredRmsDbfs = decibels(centeredRms);
  const nonQuietSampleFraction = nonQuiet / sampleCount;
  const clippedSampleFraction = clipped / sampleCount;
  const dcOffset = mean / 32_768;
  const warnings: ElevenLabsReferenceSignalAssessment["warnings"] = [];
  if (
    centeredRmsDbfs === null ||
    centeredRmsDbfs < limits.nearSilenceCenteredRmsDbfs ||
    nonQuietSampleFraction < limits.minNonQuietSampleFraction
  )
    warnings.push("near_silence");
  if (clippedSampleFraction >= limits.clippingWarningFraction) warnings.push("clipping");
  if (Math.abs(dcOffset) >= limits.dcOffsetWarningMagnitude) warnings.push("dc_offset");
  return {
    version: ELEVENLABS_REFERENCE_ASSESSMENT_VERSION,
    peak: Math.max(Math.abs(minimum), Math.abs(maximum)) / 32_768,
    rmsDbfs: decibels(rms),
    centeredRmsDbfs,
    dcOffset,
    nonQuietSampleFraction,
    clippedSampleFraction,
    warnings,
  } satisfies ElevenLabsReferenceSignalAssessment;
}

/**
 * No consent, identity/similarity verification, noise detection or paid work occurs here.
 * Signal diagnostics are advisory except a definite flatline. Ownership and current
 * speaker/retention permission must be checked by the authenticated caller.
 */
export function validateElevenLabsReference(
  bytes: Uint8Array,
  expectedSha256?: unknown,
): ElevenLabsReferenceMetadata {
  let metadata: Pcm16MonoWavMetadata;
  try {
    metadata = inspectPcm16MonoWav(bytes, {
      maxBytes: ELEVENLABS_REFERENCE_MAX_BYTES,
      minDurationSeconds: ELEVENLABS_REFERENCE_MIN_SECONDS,
      maxDurationSeconds: ELEVENLABS_REFERENCE_MAX_SECONDS,
      sampleRates: ELEVENLABS_REFERENCE_SAMPLE_RATES,
    });
  } catch {
    throw new ElevenLabsReferenceError("INVALID_AUDIO");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== undefined) {
    const expected = validateElevenLabsReferenceFingerprint(expectedSha256);
    if (!timingSafeEqual(Buffer.from(sha256, "hex"), Buffer.from(expected, "hex")))
      throw new ElevenLabsReferenceError("FINGERPRINT_MISMATCH");
  }
  const range = dataRange(bytes);
  return { ...metadata, sha256, signal: assessSignal(bytes, range.start, metadata.sampleCount) };
}

/**
 * Create an upload-owned copy containing only the validated PCM and a minimal WAV
 * header. Do not forward arbitrary RIFF metadata to the external provider.
 * The returned fingerprint covers this canonical copy, which the caller must clear
 * after use. expectedSha256, when present, covers the original selected recording.
 */
export function prepareElevenLabsReference(
  input: Uint8Array,
  expectedSha256?: unknown,
): { bytes: Uint8Array; metadata: ElevenLabsReferenceMetadata } {
  if (!(input instanceof Uint8Array) || input.byteLength > ELEVENLABS_REFERENCE_MAX_BYTES)
    throw new ElevenLabsReferenceError("INVALID_AUDIO");
  const source = Buffer.from(input);
  try {
    const original = validateElevenLabsReference(source, expectedSha256);
    const range = dataRange(source);
    const bytes = Buffer.alloc(44 + range.length);
    bytes.write("RIFF", 0, "ascii");
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write("WAVEfmt ", 8, "ascii");
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(original.sampleRateHz, 24);
    bytes.writeUInt32LE(original.sampleRateHz * 2, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write("data", 36, "ascii");
    bytes.writeUInt32LE(range.length, 40);
    bytes.set(source.subarray(range.start, range.start + range.length), 44);
    return { bytes, metadata: validateElevenLabsReference(bytes) };
  } finally {
    source.fill(0);
  }
}
