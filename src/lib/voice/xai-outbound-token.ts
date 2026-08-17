import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1 as const;
const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TOKEN_LENGTH = 180;

export type XAIOutboundTokenClaims = {
  v: typeof TOKEN_VERSION;
  leadId: string;
  iat: number;
  exp: number;
  nonce: string;
};

export type XAIOutboundTokenVerification =
  | { ok: true; claims: XAIOutboundTokenClaims }
  | {
      ok: false;
      reason: "unavailable" | "malformed" | "invalid_signature" | "expired";
    };

function signingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = String(env.INTERNAL_JWT_SECRET || "").trim();
  return secret.length >= 32 ? secret : null;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function xaiOutboundTokenReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(signingSecret(env));
}

/**
 * Mint a short, PII-free token that binds the Twilio bridge and the xAI SIP
 * webhook to one durable outbound lead. The token contains no phone number,
 * name, tenant id, or instructions; those stay server-side in Postgres.
 */
export function issueXAIOutboundToken(input: {
  leadId: bigint | string;
  nowMs?: number;
  ttlSeconds?: number;
  env?: NodeJS.ProcessEnv;
}): { token: string; claims: XAIOutboundTokenClaims } {
  const secret = signingSecret(input.env);
  if (!secret) throw new Error("Native outbound token signing is not configured.");
  const leadId = String(input.leadId).trim();
  if (!/^\d+$/.test(leadId)) throw new Error("Native outbound token requires a numeric lead id.");
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  const ttl = Math.max(60, Math.min(30 * 60, Math.floor(input.ttlSeconds ?? DEFAULT_TTL_SECONDS)));
  const claims: XAIOutboundTokenClaims = {
    v: TOKEN_VERSION,
    leadId,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
    nonce: randomBytes(6).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const token = `${payload}.${signature(payload, secret)}`;
  if (token.length > MAX_TOKEN_LENGTH) {
    throw new Error("Native outbound token exceeds the SIP header budget.");
  }
  return { token, claims };
}

export function verifyXAIOutboundToken(
  token: string,
  input: { nowMs?: number; env?: NodeJS.ProcessEnv } = {},
): XAIOutboundTokenVerification {
  const secret = signingSecret(input.env);
  if (!secret) return { ok: false, reason: "unavailable" };
  const candidate = token.trim();
  if (!candidate || candidate.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "malformed" };
  }
  const parts = candidate.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }
  const [payload, suppliedSignature] = parts;
  if (!safeEqual(signature(payload, secret), suppliedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as
      | XAIOutboundTokenClaims
      | null;
    if (
      !claims ||
      claims.v !== TOKEN_VERSION ||
      !/^\d+$/.test(String(claims.leadId || "")) ||
      !Number.isFinite(claims.iat) ||
      !Number.isFinite(claims.exp) ||
      typeof claims.nonce !== "string" ||
      claims.nonce.length < 6
    ) {
      return { ok: false, reason: "malformed" };
    }
    const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000);
    if (claims.exp < nowSeconds || claims.iat > nowSeconds + 60) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
