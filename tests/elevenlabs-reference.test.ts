import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ELEVENLABS_REFERENCE_ASSESSMENT_VERSION,
  ELEVENLABS_REFERENCE_MAX_BYTES,
  ELEVENLABS_REFERENCE_SAMPLE_RATES,
  ElevenLabsReferenceError,
  prepareElevenLabsReference,
  validateElevenLabsReference,
  validateElevenLabsReferenceFingerprint,
} from "../src/lib/voice/elevenlabs-reference";

function wav(rate = 24_000, seconds = 10, amplitude = 6_000, dcOffset = 0): Buffer {
  const samples = Math.round(rate * seconds);
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++)
    bytes.writeInt16LE(
      Math.max(-32_768, Math.min(32_767, (index % 2 ? amplitude : -amplitude) + dcOffset)),
      44 + index * 2,
    );
  return bytes;
}

function chunk(name: string, payload: Uint8Array): Buffer {
  const bytes = Buffer.alloc(8 + payload.byteLength + (payload.byteLength % 2));
  bytes.write(name, 0, "ascii");
  bytes.writeUInt32LE(payload.byteLength, 4);
  bytes.set(payload, 8);
  return bytes;
}

function riff(chunks: Uint8Array[]): Buffer {
  const bytes = Buffer.concat([Buffer.from("RIFF0000WAVE", "ascii"), ...chunks]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return bytes;
}

function expectCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error("Expected reference validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ElevenLabsReferenceError);
    expect(error).toMatchObject({ code });
  }
}

describe("ElevenLabs reference format and independent limits", () => {
  it.each(ELEVENLABS_REFERENCE_SAMPLE_RATES)(
    "accepts a 10-second mono PCM16 clip at %s Hz",
    (rate) => {
      const bytes = wav(rate);
      const metadata = validateElevenLabsReference(bytes);
      expect(metadata).toMatchObject({
        mimeType: "audio/wav",
        channels: 1,
        bitsPerSample: 16,
        sampleRateHz: rate,
        durationSeconds: 10,
        sampleCount: rate * 10,
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    },
  );

  it("accepts the full two-minute 24 kHz recorder output within the strict byte cap", () => {
    const bytes = wav(24_000, 120);
    expect(bytes.length).toBe(5_760_044);
    expect(validateElevenLabsReference(bytes)).toMatchObject({ durationSeconds: 120 });
  });

  it("rejects duration boundaries before signal assessment", () => {
    for (const seconds of [9.999, 120.001])
      expectCode(() => validateElevenLabsReference(wav(16_000, seconds)), "INVALID_AUDIO");
  });

  it("keeps the byte cap authoritative even for a supported rate and duration", () => {
    expect(ELEVENLABS_REFERENCE_MAX_BYTES).toBe(6_000_000);
    expectCode(() => validateElevenLabsReference(wav(48_000, 120)), "INVALID_AUDIO");
    expectCode(() => validateElevenLabsReference(new Uint8Array(6_000_001)), "INVALID_AUDIO");
  });

  it("permits exactly six million bytes of bounded RIFF chunks", () => {
    const original = wav();
    const extraLength = ELEVENLABS_REFERENCE_MAX_BYTES - original.length - 8;
    const exact = riff([
      original.subarray(12, 36),
      chunk("JUNK", new Uint8Array(extraLength)),
      original.subarray(36),
    ]);
    expect(exact.length).toBe(6_000_000);
    expect(validateElevenLabsReference(exact).sizeBytes).toBe(6_000_000);
  });

  it.each([
    [20, 3, 2],
    [22, 2, 2],
    [24, 8_000, 4],
    [28, 1, 4],
    [32, 4, 2],
    [34, 8, 2],
  ])("rejects incompatible WAV format fields at %s", (offset, value, width) => {
    const bytes = wav();
    if (width === 2) bytes.writeUInt16LE(value, offset);
    else bytes.writeUInt32LE(value, offset);
    expectCode(() => validateElevenLabsReference(bytes), "INVALID_AUDIO");
  });

  it("rejects malformed containers, duplicate chunks and excessive chunk counts", () => {
    const original = wav();
    const fmt = original.subarray(12, 36);
    const data = original.subarray(36);
    for (const bytes of [
      original.subarray(0, 40),
      original.subarray(0, -1),
      riff([fmt, data, data]),
      riff([data, fmt]),
      riff([...Array.from({ length: 127 }, () => chunk("JUNK", new Uint8Array())), fmt, data]),
    ])
      expectCode(() => validateElevenLabsReference(bytes), "INVALID_AUDIO");
  });

  it.each([null, undefined, "audio.wav", new ArrayBuffer(44), NaN])(
    "sanitizes malformed byte inputs",
    (input) => {
      expectCode(
        () => validateElevenLabsReference(input as unknown as Uint8Array),
        "INVALID_AUDIO",
      );
    },
  );

  it("works on a bounded Uint8Array subview without reading surrounding bytes", () => {
    const original = wav();
    const container = new Uint8Array(original.length + 12);
    container.set(original, 6);
    expect(validateElevenLabsReference(container.subarray(6, -6))).toEqual(
      validateElevenLabsReference(original),
    );
  });
});

describe("deterministic amplitude diagnostics", () => {
  it("does not describe an accepted signal as verified speech or speaker identity", () => {
    const signal = validateElevenLabsReference(wav()).signal;
    expect(signal).toEqual({
      version: ELEVENLABS_REFERENCE_ASSESSMENT_VERSION,
      peak: 6_000 / 32_768,
      rmsDbfs: 20 * Math.log10(6_000 / 32_768),
      centeredRmsDbfs: 20 * Math.log10(6_000 / 32_768),
      dcOffset: 0,
      nonQuietSampleFraction: 1,
      clippedSampleFraction: 0,
      warnings: [],
    });
    expect(Object.keys(signal)).not.toEqual(
      expect.arrayContaining(["speakerVerified", "speechDetected", "similarity"]),
    );
  });

  it.each([0, 1, -1, 1_000, 32_767, -32_768])(
    "refuses a definite flatline with DC value %s",
    (offset) => {
      expectCode(() => validateElevenLabsReference(wav(24_000, 10, 0, offset)), "SILENT_AUDIO");
    },
  );

  it("warns about near-silence without confusing amplitude with reliable speech detection", () => {
    const metadata = validateElevenLabsReference(wav(24_000, 10, 2));
    expect(metadata.signal.warnings).toEqual(["near_silence"]);
    expect(metadata.signal.nonQuietSampleFraction).toBe(0);
    expect(Number.isFinite(metadata.signal.centeredRmsDbfs)).toBe(true);
  });

  it("warns about clipped samples deterministically", () => {
    const signal = validateElevenLabsReference(wav(24_000, 10, 32_767)).signal;
    expect(signal.clippedSampleFraction).toBe(1);
    expect(signal.warnings).toEqual(["clipping"]);
  });

  it("uses centered RMS so a large DC offset cannot hide near-silence", () => {
    const signal = validateElevenLabsReference(wav(24_000, 10, 2, 1_000)).signal;
    expect(signal.rmsDbfs).toBeGreaterThan(-50);
    expect(signal.centeredRmsDbfs).toBeLessThan(-50);
    expect(signal.warnings).toEqual(["near_silence", "dc_offset"]);
  });

  it("never serializes nonfinite diagnostic numbers", () => {
    const signal = validateElevenLabsReference(wav()).signal;
    expect(JSON.stringify(signal)).not.toMatch(/Infinity|NaN/);
  });
});

describe("server fingerprints and provider-safe copies", () => {
  it("requires an exact canonical SHA-256 when one is supplied", () => {
    const bytes = wav();
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(validateElevenLabsReference(bytes, hash).sha256).toBe(hash);
    expectCode(() => validateElevenLabsReference(bytes, "a".repeat(64)), "FINGERPRINT_MISMATCH");
  });

  it.each([null, 1, "", "a".repeat(63), "A".repeat(64), `${"a".repeat(64)}\n`, "z".repeat(64)])(
    "refuses noncanonical fingerprint %j",
    (value) => {
      expectCode(() => validateElevenLabsReferenceFingerprint(value), "INVALID_FINGERPRINT");
    },
  );

  it("fingerprints the whole source, including metadata, rather than trusting a client value", () => {
    const original = wav();
    const changed = Buffer.from(original);
    changed[44] ^= 1;
    expectCode(
      () => validateElevenLabsReference(changed, validateElevenLabsReference(original).sha256),
      "FINGERPRINT_MISMATCH",
    );
  });

  it("strips arbitrary metadata and uses an independent minimal-WAV upload copy", () => {
    const original = wav();
    const withMetadata = riff([
      chunk("JUNK", Buffer.from("private-device-metadata")),
      original.subarray(12),
    ]);
    const prepared = prepareElevenLabsReference(
      withMetadata,
      validateElevenLabsReference(withMetadata).sha256,
    );
    expect(Buffer.from(prepared.bytes).equals(original)).toBe(true);
    expect(prepared.metadata).toEqual(validateElevenLabsReference(original));
    expect(withMetadata.includes(Buffer.from("private-device-metadata"))).toBe(true);
    expect(Buffer.from(prepared.bytes).includes(Buffer.from("private-device-metadata"))).toBe(
      false,
    );
    prepared.bytes.fill(0);
    expect(original.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(withMetadata.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("does not erase or mutate caller bytes when preparation fails", () => {
    const bytes = wav();
    const original = Buffer.from(bytes);
    expectCode(() => prepareElevenLabsReference(bytes, "a".repeat(64)), "FINGERPRINT_MISMATCH");
    expect(bytes.equals(original)).toBe(true);
  });
});
