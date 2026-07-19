/**
 * Shareable-artifact tokens.
 *
 * Every published artifact is addressable at `/{recap|proposal}/<slug>?t=<token>`.
 * The slug is the public path segment; the token is the bearer credential.
 * The server stores only `sha256(slug|token)`; the raw token is returned
 * to the caller once at publish time and never persisted, so a database
 * dump cannot forge access to any artifact.
 *
 * `hashToken` and `verifyToken` are pure functions so tests can pin the
 * exact hashing shape without a database.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" as const;

const SLUG_LENGTH = 16;
const TOKEN_BYTES = 24;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{12,32}$/;

function base62(bytes: Buffer): string {
  let output = "";
  for (const byte of bytes) output += BASE62_ALPHABET[byte % 62];
  return output;
}

/** 16 base62 characters. ~95 bits of entropy; unguessable in practice. */
export function mintSlug(): string {
  return base62(randomBytes(SLUG_LENGTH));
}

/** 24 random bytes rendered as URL-safe base64. Never stored. */
export function mintToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Deterministic hash for at-rest storage. Version-tagged for rotation later. */
export function hashToken(slug: string, token: string): string {
  return createHash("sha256").update(`v1|${slug}|${token}`).digest("hex");
}

/** Timing-safe verify against a stored hash. */
export function verifyToken(slug: string, token: string, storedHash: string): boolean {
  if (!isValidSlug(slug) || typeof token !== "string" || !token) return false;
  const computed = Buffer.from(hashToken(slug, token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_PATTERN.test(slug);
}
