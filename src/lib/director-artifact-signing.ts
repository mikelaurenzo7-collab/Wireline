import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedDownloadToken {
  artifactId: string;
  userId: string;
  exp: number;
  sig: string;
}

function secret(): string {
  const s = process.env.INTERNAL_JWT_SECRET;
  if (!s) {
    throw new Error("INTERNAL_JWT_SECRET environment variable is required for artifact signing");
  }
  return s;
}

function signPayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSignedDownloadToken(
  artifactId: string,
  userId: string,
  ttlSeconds = 60 * 60,
): SignedDownloadToken {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${artifactId}.${userId}.${exp}`;
  return { artifactId, userId, exp, sig: signPayload(payload) };
}

export function verifySignedDownloadToken(
  artifactId: string,
  userId: string,
  expRaw: string,
  sig: string,
): boolean {
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const payload = `${artifactId}.${userId}.${exp}`;
  const expected = signPayload(payload);
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(sig || "");
  if (expectedBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expectedBuf, sigBuf);
}

export function buildSignedDownloadUrl(
  basePath: string,
  artifactId: string,
  userId: string,
): string {
  const token = createSignedDownloadToken(artifactId, userId);
  const params = new URLSearchParams({ exp: String(token.exp), sig: token.sig });
  return `${basePath}/${encodeURIComponent(artifactId)}/download?${params.toString()}`;
}
