import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 2 as const;
const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TOKEN_LENGTH = 180;
const PLACEMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACEMENT_TAG_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export type XAIOutboundTokenClaims = {
  v: typeof TOKEN_VERSION;
  leadId: string;
  placementTag: string;
  iat: number;
  exp: number;
};

type XAIOutboundWireClaims = {
  v: typeof TOKEN_VERSION;
  l: string;
  p: string;
  i: number;
  e: number;
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

function placementTag(placementId: string): string {
  return createHash("sha256").update(placementId, "utf8").digest("base64url").slice(0, 16);
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
  placementId: string;
  nowMs?: number;
  ttlSeconds?: number;
  env?: NodeJS.ProcessEnv;
}): { token: string; claims: XAIOutboundTokenClaims } {
  const secret = signingSecret(input.env);
  if (!secret) throw new Error("Native outbound token signing is not configured.");
  const leadId = String(input.leadId).trim();
  if (!/^\d+$/.test(leadId)) throw new Error("Native outbound token requires a numeric lead id.");
  const placementId = String(input.placementId || "").trim();
  if (!PLACEMENT_ID_PATTERN.test(placementId)) {
    throw new Error("Native outbound token requires a valid placement id.");
  }
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000);
  const ttl = Math.max(60, Math.min(30 * 60, Math.floor(input.ttlSeconds ?? DEFAULT_TTL_SECONDS)));
  const claims: XAIOutboundTokenClaims = {
    v: TOKEN_VERSION,
    leadId,
    placementTag: placementTag(placementId),
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  };
  // Keep the signed wire envelope compact enough for the SIP URI/header path;
  // callers still receive descriptive claim names after verification.
  const wireClaims: XAIOutboundWireClaims = {
    v: claims.v,
    l: claims.leadId,
    p: claims.placementTag,
    i: claims.iat,
    e: claims.exp,
  };
  const payload = Buffer.from(JSON.stringify(wireClaims), "utf8").toString("base64url");
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
    const wireClaims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as XAIOutboundWireClaims | null;
    if (
      !wireClaims ||
      wireClaims.v !== TOKEN_VERSION ||
      !/^\d+$/.test(String(wireClaims.l || "")) ||
      !PLACEMENT_TAG_PATTERN.test(String(wireClaims.p || "")) ||
      !Number.isFinite(wireClaims.i) ||
      !Number.isFinite(wireClaims.e) ||
      wireClaims.e <= wireClaims.i
    ) {
      return { ok: false, reason: "malformed" };
    }
    const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1_000);
    if (wireClaims.e < nowSeconds || wireClaims.i > nowSeconds + 60) {
      return { ok: false, reason: "expired" };
    }
    const claims: XAIOutboundTokenClaims = {
      v: wireClaims.v,
      leadId: wireClaims.l,
      placementTag: wireClaims.p,
      iat: wireClaims.i,
      exp: wireClaims.e,
    };
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

/**
 * A signed token owns exactly one carrier placement, not merely a reusable
 * lead. Callers must evaluate this after taking the lead advisory lock so a
 * delayed callback from attempt N cannot claim attempt N+1.
 */
export function xaiOutboundPlacementMatches(
  nativeVoice: Record<string, unknown>,
  claims: XAIOutboundTokenClaims,
): boolean {
  const placementId = String(nativeVoice.placement_id || "").trim();
  return (
    PLACEMENT_ID_PATTERN.test(placementId) &&
    PLACEMENT_TAG_PATTERN.test(claims.placementTag) &&
    safeEqual(placementTag(placementId), claims.placementTag)
  );
}
