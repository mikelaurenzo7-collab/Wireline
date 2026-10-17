/** Pure, bounded PCM WAV inspection shared by reference and generated audio. */
export const VOICE_REFERENCE_MAX_BYTES = 2_000_000;
export const VOICE_REFERENCE_MIN_SECONDS = 6;
export const VOICE_REFERENCE_MAX_SECONDS = 20;
export const VOICE_REFERENCE_SAMPLE_RATES = [16_000, 22_050, 24_000, 44_100, 48_000] as const;

const MAX_CHUNKS = 128;

export type Pcm16MonoWavMetadata = {
  mimeType: "audio/wav";
  sampleRateHz: number;
  channels: 1;
  bitsPerSample: 16;
  sampleCount: number;
  durationSeconds: number;
  sizeBytes: number;
};

function invalid(): never {
  throw new Error("The PCM voice audio is invalid.");
}

function fourCc(bytes: Uint8Array, offset: number, expected: string): boolean {
  return Array.from(expected).every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

export function inspectPcm16MonoWav(
  bytes: Uint8Array,
  policy: {
    maxBytes: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    sampleRates: readonly number[];
  },
): Pcm16MonoWavMetadata {
  if (
    !Number.isSafeInteger(policy.maxBytes) ||
    policy.maxBytes < 44 ||
    !Number.isFinite(policy.minDurationSeconds) ||
    policy.minDurationSeconds < 0 ||
    !Number.isFinite(policy.maxDurationSeconds) ||
    policy.maxDurationSeconds <= 0 ||
    policy.minDurationSeconds > policy.maxDurationSeconds ||
    !Array.isArray(policy.sampleRates) ||
    policy.sampleRates.length === 0 ||
    policy.sampleRates.some((rate) => !Number.isSafeInteger(rate) || rate <= 0) ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 44 ||
    bytes.byteLength > policy.maxBytes
  )
    invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    !fourCc(bytes, 0, "RIFF") ||
    !fourCc(bytes, 8, "WAVE") ||
    view.getUint32(4, true) + 8 !== bytes.byteLength
  )
    invalid();

  let offset = 12;
  let chunks = 0;
  let sampleRateHz: number | null = null;
  let sampleCount: number | null = null;
  while (offset < bytes.byteLength) {
    chunks += 1;
    if (chunks > MAX_CHUNKS || bytes.byteLength - offset < 8) invalid();
    const chunkSize = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + chunkSize;
    const paddedEnd = end + (chunkSize % 2);
    if (end > bytes.byteLength || paddedEnd > bytes.byteLength) invalid();
    if (fourCc(bytes, offset, "fmt ")) {
      if (sampleRateHz !== null || chunkSize !== 16) invalid();
      const rate = view.getUint32(start + 4, true);
      if (
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 2, true) !== 1 ||
        !policy.sampleRates.includes(rate) ||
        view.getUint32(start + 8, true) !== rate * 2 ||
        view.getUint16(start + 12, true) !== 2 ||
        view.getUint16(start + 14, true) !== 16
      )
        invalid();
      sampleRateHz = rate;
    } else if (fourCc(bytes, offset, "data")) {
      if (sampleRateHz === null || sampleCount !== null || chunkSize === 0 || chunkSize % 2 !== 0)
        invalid();
      sampleCount = chunkSize / 2;
      if (
        sampleCount < sampleRateHz * policy.minDurationSeconds ||
        sampleCount > sampleRateHz * policy.maxDurationSeconds
      )
        invalid();
    }
    offset = paddedEnd;
  }
  if (sampleRateHz === null || sampleCount === null || offset !== bytes.byteLength) invalid();
  return {
    mimeType: "audio/wav",
    sampleRateHz,
    channels: 1,
    bitsPerSample: 16,
    sampleCount,
    durationSeconds: sampleCount / sampleRateHz,
    sizeBytes: bytes.byteLength,
  };
}
