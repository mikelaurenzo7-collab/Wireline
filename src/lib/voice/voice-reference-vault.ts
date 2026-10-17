/**
 * Server-only reference-audio validation and encryption foundation.
 * This does not record consent, grant inference permission, or enable calls.
 * Callers must authorize the tenant, speaker consent and asset lifecycle.
 */
import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getDataKey } from "../secret-vault";
import {
  inspectPcm16MonoWav,
  VOICE_REFERENCE_MAX_BYTES,
  VOICE_REFERENCE_MIN_SECONDS,
  VOICE_REFERENCE_MAX_SECONDS,
  VOICE_REFERENCE_SAMPLE_RATES,
  type Pcm16MonoWavMetadata,
} from "./voice-reference-audio";

export {
  VOICE_REFERENCE_MAX_BYTES,
  VOICE_REFERENCE_MIN_SECONDS,
  VOICE_REFERENCE_MAX_SECONDS,
  VOICE_REFERENCE_SAMPLE_RATES,
} from "./voice-reference-audio";
const PREFIX = "vref1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_ENVELOPE_CHARS = Math.ceil((VOICE_REFERENCE_MAX_BYTES * 4) / 3) + 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type VaultErrorCode =
  "INVALID_IDENTITY" | "INVALID_AUDIO" | "INVALID_ENVELOPE" | "VAULT_UNAVAILABLE";

export class VoiceReferenceVaultError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(
      code === "VAULT_UNAVAILABLE"
        ? "The private voice vault is unavailable."
        : "The private voice reference is invalid.",
    );
    this.name = "VoiceReferenceVaultError";
  }
}

export type VoiceReferenceMetadata = Pcm16MonoWavMetadata & {
  sha256: string;
};

export type VoiceReferenceIdentity = {
  userId: string;
  assetId: string;
  /** Normalize browser MIME aliases before entering this strict vault boundary. */
  mimeType: "audio/wav";
};

function failAudio(): never {
  throw new VoiceReferenceVaultError("INVALID_AUDIO");
}

/** Validate a bounded, decoded PCM16 mono RIFF/WAVE clip without touching secrets. */
export function validateVoiceReference(bytes: Uint8Array): VoiceReferenceMetadata {
  try {
    const metadata = inspectPcm16MonoWav(bytes, {
      maxBytes: VOICE_REFERENCE_MAX_BYTES,
      minDurationSeconds: VOICE_REFERENCE_MIN_SECONDS,
      maxDurationSeconds: VOICE_REFERENCE_MAX_SECONDS,
      sampleRates: VOICE_REFERENCE_SAMPLE_RATES,
    });
    return { ...metadata, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return failAudio();
  }
}

function associatedData(identity: VoiceReferenceIdentity): Buffer {
  if (
    !identity ||
    typeof identity.userId !== "string" ||
    identity.userId.length !== 36 ||
    !UUID.test(identity.userId) ||
    typeof identity.assetId !== "string" ||
    identity.assetId.length !== 36 ||
    !UUID.test(identity.assetId) ||
    identity.mimeType !== "audio/wav"
  )
    throw new VoiceReferenceVaultError("INVALID_IDENTITY");
  return Buffer.from(
    JSON.stringify({
      domain: "botbound/voice-reference",
      version: 1,
      userId: identity.userId,
      assetId: identity.assetId,
      mimeType: identity.mimeType,
    }),
    "utf8",
  );
}

function dataKey(): Buffer {
  try {
    return getDataKey();
  } catch {
    throw new VoiceReferenceVaultError("VAULT_UNAVAILABLE");
  }
}

/** Encrypt a private copy so a caller cannot alter validated bytes before sealing. */
export function encryptVoiceReference(
  input: VoiceReferenceIdentity & { bytes: Uint8Array },
): string {
  const aad = associatedData(input);
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength > VOICE_REFERENCE_MAX_BYTES)
    failAudio();
  const bytes = Buffer.from(input.bytes);
  try {
    validateVoiceReference(bytes);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return [
      PREFIX,
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  } catch (error) {
    if (error instanceof VoiceReferenceVaultError) throw error;
    throw new VoiceReferenceVaultError("VAULT_UNAVAILABLE");
  } finally {
    bytes.fill(0);
  }
}

function decodePart(value: string, minBytes: number, maxBytes: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new VoiceReferenceVaultError("INVALID_ENVELOPE");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < minBytes || bytes.length > maxBytes || bytes.toString("base64url") !== value)
    throw new VoiceReferenceVaultError("INVALID_ENVELOPE");
  return bytes;
}

/** Open only for the same tenant/asset/MIME, and validate the authenticated audio again. */
export function decryptVoiceReference(
  input: VoiceReferenceIdentity & { sealedReference: string },
): { bytes: Uint8Array; metadata: VoiceReferenceMetadata } {
  const aad = associatedData(input);
  const envelope = input.sealedReference;
  if (typeof envelope !== "string" || envelope.length > MAX_ENVELOPE_CHARS)
    throw new VoiceReferenceVaultError("INVALID_ENVELOPE");
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX)
    throw new VoiceReferenceVaultError("INVALID_ENVELOPE");
  const iv = decodePart(parts[1], IV_BYTES, IV_BYTES);
  const tag = decodePart(parts[2], TAG_BYTES, TAG_BYTES);
  const ciphertext = decodePart(parts[3], 44, VOICE_REFERENCE_MAX_BYTES);
  const key = dataKey();
  let plaintext: Buffer;
  let unverified: Buffer | null = null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    unverified = decipher.update(ciphertext);
    plaintext = Buffer.concat([unverified, decipher.final()]);
  } catch {
    throw new VoiceReferenceVaultError("INVALID_ENVELOPE");
  } finally {
    // GCM update may produce unauthenticated bytes before final() checks the
    // tag. Never retain that intermediate copy after either outcome.
    unverified?.fill(0);
  }
  try {
    const metadata = validateVoiceReference(plaintext);
    return { bytes: new Uint8Array(plaintext), metadata };
  } finally {
    plaintext.fill(0);
  }
}
