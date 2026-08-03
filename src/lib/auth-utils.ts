/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { log } from "./server-context";

const WIRELINE_JWT_ISSUER = "wireline-internal";
const WIRELINE_JWT_AUDIENCE = "authenticated";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Wireline internal JWT payload (HS256, signed with `INTERNAL_JWT_SECRET`).
 *
 * The shape mirrors a standard RFC 7519 / jose payload — `sub`, `aud`, `iat`,
 * `exp`, `iss` — purely because that is the conventional JWT vocabulary, not
 * because Supabase Auth is the issuer. Wireline mints and verifies these
 * tokens entirely in-process; there is no round-trip to Supabase Auth.
 */
export interface JwtPayload {
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
  [key: string]: any;
}

/**
 * Verifies a Wireline internal JWT locally using the HMAC secret
 * (`INTERNAL_JWT_SECRET`). This is **not** a Supabase Auth token — Wireline
 * mints and verifies its own session JWTs, so there is no SDK or network
 * round-trip involved.
 */
export async function verifyInternalJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const segments = token.split(".");
    if (segments.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = segments;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    // 0. Lock algorithm + type before signature work (alg-confusion hardening).
    let header: { alg?: string; typ?: string };
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as {
        alg?: string;
        typ?: string;
      };
    } catch {
      return null;
    }
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      log.warn("JWT rejected: unsupported alg/typ", { alg: header.alg, typ: header.typ });
      return null;
    }

    // 1. Verify Signature
    const data = `${headerB64}.${payloadB64}`;
    const hmac = createHmac("sha256", secret);
    hmac.update(data);
    const expectedSignature = hmac.digest("base64url");

    const providedSignature = Buffer.from(signatureB64);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);
    if (
      providedSignature.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(providedSignature, expectedSignatureBuffer)
    ) {
      return null;
    }

    // 2. Parse Payload
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // 3. Require finite NumericDate claims. Downstream session logic uses iat
    //    for legacy revocation and user metadata, so malformed signed tokens
    //    must be rejected here rather than surfacing as route-level exceptions.
    if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat) || payload.iat <= 0) {
      log.warn("JWT missing or non-numeric iat", { sub: payload.sub, iat: payload.iat });
      return null;
    }
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      log.warn("JWT missing or non-numeric exp", { sub: payload.sub, exp: payload.exp });
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    // RFC 7519 requires the current time to be strictly before exp.
    if (payload.exp <= now) {
      log.warn("JWT expired", { sub: payload.sub, exp: payload.exp, now });
      return null;
    }

    if (payload.iss !== WIRELINE_JWT_ISSUER) {
      log.warn("JWT rejected: invalid issuer", { iss: payload.iss, sub: payload.sub });
      return null;
    }
    if (payload.aud !== WIRELINE_JWT_AUDIENCE) {
      log.warn("JWT rejected: invalid audience", { aud: payload.aud, sub: payload.sub });
      return null;
    }
    if (typeof payload.sub !== "string" || !UUID_RE.test(payload.sub)) {
      log.warn("JWT rejected: invalid subject", { sub: payload.sub });
      return null;
    }

    return payload;
  } catch (err: any) {
    log.error("JWT verification failed", { error: err.message });
    return null;
  }
}
