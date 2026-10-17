import { Buffer } from "node:buffer";
import { createCipheriv, createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inspectPcm16MonoWav } from "../src/lib/voice/voice-reference-audio";
import {
  decryptVoiceReference,
  encryptVoiceReference,
  validateVoiceReference,
  VoiceReferenceVaultError,
  VOICE_REFERENCE_MAX_BYTES,
  VOICE_REFERENCE_SAMPLE_RATES,
} from "../src/lib/voice/voice-reference-vault";

const identity = {
  userId: "11111111-1111-4111-8111-111111111111",
  assetId: "22222222-2222-4222-8222-222222222222",
  mimeType: "audio/wav" as const,
};
const OTHER_USER = "33333333-3333-4333-8333-333333333333";
const OTHER_ASSET = "44444444-4444-4444-8444-444444444444";
const KEY = Buffer.alloc(32, 7);

function wav(
  sampleRate = 24_000,
  seconds = 6,
  sampleCount = Math.round(sampleRate * seconds),
): Buffer {
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(sampleCount * 2, 40);
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

function audioError(operation: () => unknown, code = "INVALID_AUDIO") {
  try {
    operation();
    throw new Error("expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(VoiceReferenceVaultError);
    expect(error).toMatchObject({ code });
    return error as VoiceReferenceVaultError;
  }
}

beforeEach(() => vi.stubEnv("WIRELINE_DATA_KEY", KEY.toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("bounded private PCM voice references", () => {
  it.each(VOICE_REFERENCE_SAMPLE_RATES)(
    "accepts the documented duration boundaries at %s Hz",
    (sampleRate) => {
      for (const duration of [6, 20]) {
        const bytes = wav(sampleRate, duration);
        expect(validateVoiceReference(bytes)).toEqual({
          mimeType: "audio/wav",
          sampleRateHz: sampleRate,
          channels: 1,
          bitsPerSample: 16,
          sampleCount: sampleRate * duration,
          durationSeconds: duration,
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    },
  );

  it.each(VOICE_REFERENCE_SAMPLE_RATES)(
    "rejects one frame outside either duration boundary at %s Hz",
    (sampleRate) => {
      audioError(() => validateVoiceReference(wav(sampleRate, 6, sampleRate * 6 - 1)));
      audioError(() => validateVoiceReference(wav(sampleRate, 20, sampleRate * 20 + 1)));
    },
  );

  it("validates a Uint8Array view with a nonzero byte offset", () => {
    const original = wav();
    const container = new Uint8Array(original.length + 20);
    container.set(original, 10);
    expect(validateVoiceReference(container.subarray(10, 10 + original.length))).toEqual(
      validateVoiceReference(original),
    );
  });

  it("uses the exact two-million-byte worker limit", () => {
    expect(VOICE_REFERENCE_MAX_BYTES).toBe(2_000_000);
    const original = wav(48_000, 20);
    const extraPayload = VOICE_REFERENCE_MAX_BYTES - original.length - 8;
    const exact = riff([
      original.subarray(12, 36),
      chunk("JUNK", new Uint8Array(extraPayload)),
      original.subarray(36),
    ]);
    expect(exact.length).toBe(VOICE_REFERENCE_MAX_BYTES);
    expect(validateVoiceReference(exact).sizeBytes).toBe(VOICE_REFERENCE_MAX_BYTES);
    audioError(() => validateVoiceReference(new Uint8Array(VOICE_REFERENCE_MAX_BYTES + 1)));
  });

  it("permits bounded extra RIFF chunks and proper odd-byte padding", () => {
    const original = wav();
    const bytes = riff([
      chunk("JUNK", new Uint8Array([7])),
      original.subarray(12, 36),
      original.subarray(36),
      chunk("LIST", new Uint8Array([1, 2])),
    ]);
    expect(validateVoiceReference(bytes)).toMatchObject({
      durationSeconds: 6,
      sampleRateHz: 24_000,
      sizeBytes: bytes.length,
    });
  });

  it.each([
    [20, 3, 2], // IEEE float rather than PCM.
    [22, 2, 2], // Stereo.
    [24, 8_000, 4], // Unsupported rate.
    [28, 1, 4], // Wrong byte rate.
    [32, 4, 2], // Wrong block alignment.
    [34, 8, 2], // Wrong sample width.
    [16, 18, 4], // Extended fmt chunk.
  ])("rejects incompatible fmt fields at byte %s", (offset, value, width) => {
    const bytes = wav();
    if (width === 2) bytes.writeUInt16LE(value, offset);
    else bytes.writeUInt32LE(value, offset);
    audioError(() => validateVoiceReference(bytes));
  });

  it.each(["RIFX", "RF64", "OggS", "ID3 "])("rejects a non-RIFF container %s", (signature) => {
    const bytes = wav();
    bytes.write(signature, 0, "ascii");
    audioError(() => validateVoiceReference(bytes));
  });

  it("rejects a malformed WAVE signature and truncated header", () => {
    const bytes = wav();
    bytes.write("NOT!", 8, "ascii");
    audioError(() => validateVoiceReference(bytes));
    audioError(() => validateVoiceReference(wav().subarray(0, 43)));
  });

  it.each([-1, 1])("rejects a declared RIFF length mismatch of %s", (difference) => {
    const bytes = wav();
    bytes.writeUInt32LE(bytes.length - 8 + difference, 4);
    audioError(() => validateVoiceReference(bytes));
  });

  it("rejects chunk overruns, missing padding and trailing partial chunk headers", () => {
    const tooLarge = wav();
    tooLarge.writeUInt32LE(0xffff_ffff, 40);
    audioError(() => validateVoiceReference(tooLarge));
    const original = wav();
    const missingPadding = riff([
      original.subarray(12),
      chunk("JUNK", new Uint8Array([1])).subarray(0, 9),
    ]);
    audioError(() => validateVoiceReference(missingPadding));
    audioError(() =>
      validateVoiceReference(riff([original.subarray(12), new Uint8Array([1, 2, 3])])),
    );
  });

  it("rejects duplicate or missing fmt/data chunks and data before fmt", () => {
    const original = wav();
    const fmt = original.subarray(12, 36);
    const data = original.subarray(36);
    for (const chunks of [[fmt, fmt, data], [fmt, data, data], [data, fmt], [fmt], [data]]) {
      audioError(() => validateVoiceReference(riff(chunks)));
    }
  });

  it("rejects empty and odd-length PCM data", () => {
    const original = wav();
    for (const payload of [new Uint8Array(), new Uint8Array(24_000 * 12 + 1)]) {
      audioError(() =>
        validateVoiceReference(riff([original.subarray(12, 36), chunk("data", payload)])),
      );
    }
  });

  it("bounds work for a large number of zero-sized RIFF chunks", () => {
    const original = wav();
    const fmt = original.subarray(12, 36);
    const data = original.subarray(36);
    const empty = chunk("JUNK", new Uint8Array());
    expect(
      validateVoiceReference(riff([...Array.from({ length: 126 }, () => empty), fmt, data])),
    ).toMatchObject({ durationSeconds: 6 });
    audioError(() =>
      validateVoiceReference(riff([...Array.from({ length: 127 }, () => empty), fmt, data])),
    );
    audioError(() =>
      validateVoiceReference(riff([...Array.from({ length: 5_000 }, () => empty), fmt, data])),
    );
  });

  it.each([null, undefined, "audio", new ArrayBuffer(44), NaN, Infinity])(
    "rejects malformed byte inputs",
    (bytes) => {
      audioError(() => validateVoiceReference(bytes as unknown as Uint8Array));
    },
  );

  it("keeps the shared parser independent from secrets and supports the bounded worker output policy", () => {
    vi.stubEnv("WIRELINE_DATA_KEY", "");
    const policy = {
      maxBytes: 2_880_044,
      minDurationSeconds: 0,
      maxDurationSeconds: 60,
      sampleRates: [24_000],
    };
    expect(inspectPcm16MonoWav(wav(24_000, 60), policy)).toMatchObject({
      durationSeconds: 60,
      sizeBytes: 2_880_044,
    });
    expect(inspectPcm16MonoWav(wav(24_000, 0, 1), policy)).toMatchObject({ sampleCount: 1 });
    expect(() => inspectPcm16MonoWav(wav(24_000, 60, 24_000 * 60 + 1), policy)).toThrow(
      "The PCM voice audio is invalid.",
    );
    expect(() => inspectPcm16MonoWav(wav(24_000, 0, 0), policy)).toThrow(
      "The PCM voice audio is invalid.",
    );
    expect(validateVoiceReference(wav())).toMatchObject({ durationSeconds: 6 });
  });

  it.each([
    { maxBytes: NaN },
    { maxBytes: 43 },
    { minDurationSeconds: -1 },
    { maxDurationSeconds: Infinity },
    { minDurationSeconds: 21 },
    { sampleRates: [] },
    { sampleRates: [NaN] },
  ])("rejects invalid shared-parser policies", (override) => {
    expect(() =>
      inspectPcm16MonoWav(wav(), {
        maxBytes: 2_000_000,
        minDurationSeconds: 6,
        maxDurationSeconds: 20,
        sampleRates: [24_000],
        ...override,
      }),
    ).toThrow("The PCM voice audio is invalid.");
  });
});

describe("tenant-bound reference encryption", () => {
  it("round-trips private bytes with fresh randomized encryption and safe metadata", () => {
    const bytes = wav();
    const sealedReference = encryptVoiceReference({ ...identity, bytes });
    expect(sealedReference).toMatch(/^vref1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const opened = decryptVoiceReference({ ...identity, sealedReference });
    expect(opened.bytes).toEqual(new Uint8Array(bytes));
    expect(opened.metadata).toEqual(validateVoiceReference(bytes));
    expect(encryptVoiceReference({ ...identity, bytes })).not.toBe(sealedReference);
    expect(sealedReference).not.toContain(identity.userId);
    expect(sealedReference).not.toContain(identity.assetId);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("rejects a different tenant or asset even when the encrypted content is valid", () => {
    const sealedReference = encryptVoiceReference({ ...identity, bytes: wav() });
    audioError(
      () => decryptVoiceReference({ ...identity, userId: OTHER_USER, sealedReference }),
      "INVALID_ENVELOPE",
    );
    audioError(
      () => decryptVoiceReference({ ...identity, assetId: OTHER_ASSET, sealedReference }),
      "INVALID_ENVELOPE",
    );
  });

  it.each([0, 1, 2, 3])("rejects a modified envelope component %s", (part) => {
    const parts = encryptVoiceReference({ ...identity, bytes: wav() }).split(".");
    if (part === 0) parts[0] = "vref2";
    else {
      const bytes = Buffer.from(parts[part], "base64url");
      bytes[0] ^= 1;
      parts[part] = bytes.toString("base64url");
    }
    audioError(
      () => decryptVoiceReference({ ...identity, sealedReference: parts.join(".") }),
      "INVALID_ENVELOPE",
    );
  });

  it.each([
    "",
    "vref1.x.y.z",
    "vref1.aaa.bbb.ccc",
    "vref1...",
    "vref1.a.b.c.extra",
    "x".repeat(2_700_000),
  ])("rejects malformed or oversized envelopes", (sealedReference) => {
    audioError(() => decryptVoiceReference({ ...identity, sealedReference }), "INVALID_ENVELOPE");
  });

  it("rejects truncated ciphertext and noncanonical base64 padding", () => {
    const parts = encryptVoiceReference({ ...identity, bytes: wav() }).split(".");
    const truncated = [...parts];
    truncated[3] = truncated[3].slice(0, -4);
    audioError(
      () => decryptVoiceReference({ ...identity, sealedReference: truncated.join(".") }),
      "INVALID_ENVELOPE",
    );
    parts[1] += "=";
    audioError(
      () => decryptVoiceReference({ ...identity, sealedReference: parts.join(".") }),
      "INVALID_ENVELOPE",
    );
  });

  it.each([
    null,
    undefined,
    NaN,
    Infinity,
    "x".repeat(10_000),
    "11111111111141118111111111111111",
    "ABCDEF12-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-111111111111\n",
  ])("rejects noncanonical tenant and asset identifiers", (value) => {
    for (const field of ["userId", "assetId"]) {
      const invalid = { ...identity, [field]: value } as typeof identity;
      audioError(() => encryptVoiceReference({ ...invalid, bytes: wav() }), "INVALID_IDENTITY");
      audioError(
        () => decryptVoiceReference({ ...invalid, sealedReference: "invalid" }),
        "INVALID_IDENTITY",
      );
    }
  });

  it("rejects a different MIME declaration without releasing source audio", () => {
    const sealedReference = encryptVoiceReference({ ...identity, bytes: wav() });
    audioError(
      () =>
        decryptVoiceReference({
          ...identity,
          mimeType: "audio/x-wav" as "audio/wav",
          sealedReference,
        }),
      "INVALID_IDENTITY",
    );
    audioError(
      () =>
        encryptVoiceReference({ ...identity, mimeType: "audio/mpeg" as "audio/wav", bytes: wav() }),
      "INVALID_IDENTITY",
    );
  });

  it("revalidates authenticated source bytes rather than trusting encryption alone", () => {
    const bytes = wav();
    bytes.writeUInt16LE(2, 22);
    const iv = Buffer.alloc(12, 1);
    const cipher = createCipheriv("aes-256-gcm", KEY, iv);
    cipher.setAAD(
      Buffer.from(
        JSON.stringify({ domain: "botbound/voice-reference", version: 1, ...identity }),
        "utf8",
      ),
    );
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const sealedReference = [
      "vref1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
    audioError(() => decryptVoiceReference({ ...identity, sealedReference }));
  });

  it("refuses encryption when the vault key is missing without disclosing configuration", () => {
    vi.stubEnv("WIRELINE_DATA_KEY", "");
    const error = audioError(
      () => encryptVoiceReference({ ...identity, bytes: wav() }),
      "VAULT_UNAVAILABLE",
    );
    expect(String(error)).toBe("VoiceReferenceVaultError: The private voice vault is unavailable.");
    expect(JSON.stringify(error)).not.toContain("WIRELINE_DATA_KEY");
  });

  it("rejects a wrong vault key with the same sanitized authentication failure", () => {
    const sealedReference = encryptVoiceReference({ ...identity, bytes: wav() });
    vi.stubEnv("WIRELINE_DATA_KEY", Buffer.alloc(32, 8).toString("base64"));
    const error = audioError(
      () => decryptVoiceReference({ ...identity, sealedReference }),
      "INVALID_ENVELOPE",
    );
    expect(JSON.stringify(error)).not.toContain(sealedReference);
    expect(String(error)).not.toContain(identity.userId);
  });
});
