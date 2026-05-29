// Application-layer encryption for secrets stored in Postgres.
//
// Rationale: webhook signing secrets, intake keys, and similar tokens
// must survive a partial DB compromise (read-only SQL injection, leaked
// backup, accidental table export) without leaking plaintext. We
// encrypt at the application layer with AES-256-GCM keyed by a single
// environment variable (`WIRELINE_DATA_KEY`, 32 raw bytes, base64).
//
// Storage format (string, ASCII; designed to fit a TEXT column so the
// existing schema doesn't need a bytea migration):
//
//   v1.<iv_b64>.<tag_b64>.<ciphertext_b64>
//
// • v1   — version prefix; bumps if we ever rotate algorithm / key id.
// • iv   — 12 random bytes, fresh per encryption (required for GCM).
// • tag  — 16-byte GCM authentication tag.
// • ct   — ciphertext.
//
// All three byte components use STANDARD base64 (RFC 4648 §4 — includes
// `+`, `/`, `=`). We do NOT use base64url because the envelope is
// stored in a TEXT column and never embedded in URLs; the `.`
// separator is not in the standard base64 alphabet so split() is safe.
//
// Fail-CLOSED on key misconfiguration: when WIRELINE_DATA_KEY is unset
// the encrypt/decrypt functions throw. Callers must catch and refuse
// to persist plaintext fallbacks (`server.ts` does this for webhooks).

import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = "v1";

let cachedKey: Buffer | null = null;
let cachedKeyEnv: string | undefined;

/**
 * Resolve the 32-byte data key from the environment. Throws when the
 * env var is unset or malformed so the caller fails fast.
 *
 * Accepts the key in either base64 (44 chars, recommended) or hex
 * (64 chars). Anything else is rejected.
 */
export function getDataKey(): Buffer {
  const raw = process.env.WIRELINE_DATA_KEY;
  if (cachedKey && cachedKeyEnv === raw) return cachedKey;
  if (!raw) {
    throw new Error(
      "WIRELINE_DATA_KEY is not set. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`",
    );
  }
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      throw new Error("WIRELINE_DATA_KEY must be base64 or 64-char hex.");
    }
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `WIRELINE_DATA_KEY must decode to exactly ${KEY_BYTES} bytes (got ${buf.length}).`,
    );
  }
  cachedKey = buf;
  cachedKeyEnv = raw;
  return buf;
}

/** True when WIRELINE_DATA_KEY is present and well-formed. */
export function isVaultConfigured(): boolean {
  try {
    getDataKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a UTF-8 plaintext string. Throws if the key is misconfigured. */
export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string") throw new Error("encryptSecret: plaintext must be a string");
  const key = getDataKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/**
 * Decrypt a value produced by `encryptSecret`. Throws on any of:
 *   • malformed envelope
 *   • wrong version prefix
 *   • tampered ciphertext (GCM auth-tag mismatch)
 *   • missing / malformed data key
 */
export function decryptSecret(envelope: string): string {
  if (typeof envelope !== "string") throw new Error("decryptSecret: input must be a string");
  const parts = envelope.split(".");
  if (parts.length !== 4) throw new Error("decryptSecret: malformed envelope");
  const [v, ivB64, tagB64, ctB64] = parts;
  if (v !== VERSION) throw new Error(`decryptSecret: unsupported version "${v}"`);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  if (iv.length !== IV_BYTES) throw new Error("decryptSecret: bad iv length");
  if (tag.length !== TAG_BYTES) throw new Error("decryptSecret: bad tag length");
  const key = getDataKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

/**
 * Cheap envelope-shape check used by callers that may receive either an
 * encrypted value or a legacy plaintext (e.g. during a backfill window).
 * Returns false for any string that is not a valid envelope; never
 * throws.
 */
export function looksEncrypted(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith(VERSION + ".")) return false;
  const parts = value.split(".");
  return parts.length === 4 && parts.every((p) => p.length > 0);
}

/**
 * Constant-time string compare — useful for comparing decrypted secrets
 * against a candidate without leaking length-based timing info. Returns
 * false for mismatched lengths.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Return the last 4 chars of a plaintext secret for display in UIs. */
export function lastFour(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) return "";
  return plaintext.length <= 4 ? plaintext : plaintext.slice(-4);
}
