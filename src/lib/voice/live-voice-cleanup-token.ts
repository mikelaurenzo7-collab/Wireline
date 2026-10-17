import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

import { requireInternalJwtSecret } from "../internal-jwt-secret";

const LABEL = "botbound/private-voice-cleanup/v1";
const MAX_TOKEN_LENGTH = 2_048;
const MAX_TTL_SECONDS = 3_900;

type CleanupClaims = {
  v: 1;
  userId: string;
  agentId: string;
  callId: string;
  keyFingerprint: string;
  iat: number;
  exp: number;
};

function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  return createHmac("sha256", requireInternalJwtSecret(env)).update(LABEL).digest();
}

function validClaims(value: unknown): value is CleanupClaims {
  if (!value || typeof value !== "object") return false;
  const claims = value as Partial<CleanupClaims>;
  return (
    claims.v === 1 &&
    typeof claims.userId === "string" &&
    claims.userId.length > 0 &&
    claims.userId.length <= 200 &&
    typeof claims.agentId === "string" &&
    claims.agentId.length > 0 &&
    claims.agentId.length <= 200 &&
    typeof claims.callId === "string" &&
    /^[A-Za-z0-9_.:-]{1,256}$/.test(claims.callId) &&
    typeof claims.keyFingerprint === "string" &&
    /^[a-f0-9]{24}$/.test(claims.keyFingerprint) &&
    Number.isSafeInteger(claims.iat) &&
    Number.isSafeInteger(claims.exp) &&
    claims.exp! > claims.iat! &&
    claims.exp! - claims.iat! <= MAX_TTL_SECONDS
  );
}

/** Validate encryption configuration before a billable provider call is created. */
export function createLiveVoiceCleanupIssuer(env: NodeJS.ProcessEnv = process.env) {
  const key = encryptionKey(env);
  return (input: {
    userId: string;
    agentId: string;
    callId: string;
    keyFingerprint: string;
    maxDurationSeconds: number;
    nowMs?: number;
  }): string => {
    const iat = Math.floor((input.nowMs ?? Date.now()) / 1_000);
    const claims: CleanupClaims = {
      v: 1,
      userId: input.userId,
      agentId: input.agentId,
      callId: input.callId,
      keyFingerprint: input.keyFingerprint,
      iat,
      exp: iat + Math.min(3_600, Math.max(15, Math.floor(input.maxDurationSeconds))) + 300,
    };
    if (!validClaims(claims)) throw new Error("Invalid private voice cleanup claims.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(LABEL));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(claims), "utf8"),
      cipher.final(),
    ]);
    return [iv, ciphertext, cipher.getAuthTag()]
      .map((part) => part.toString("base64url"))
      .join(".");
  };
}

/** The sealed ticket hides internal call metadata and never replaces authentication. */
export function verifyLiveVoiceCleanupToken(
  token: string,
  input: { userId: string; nowMs?: number; env?: NodeJS.ProcessEnv },
): CleanupClaims | null {
  const key = encryptionKey(input.env);
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(LABEL));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      "utf8",
    );
    const claims: unknown = JSON.parse(plaintext);
    const now = Math.floor((input.nowMs ?? Date.now()) / 1_000);
    if (
      !validClaims(claims) ||
      claims.userId !== input.userId ||
      claims.exp <= now ||
      claims.iat > now + 60
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}
