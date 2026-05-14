import { createHmac, timingSafeEqual } from "node:crypto";
import { log } from "./server-context";

/**
 * Standard Supabase / jose-style JWT payload.
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
 * Verifies a Supabase JWT locally using the HMAC secret.
 * This avoids a round-trip to the Supabase API and removes the need for the SDK.
 */
export async function verifySupabaseJwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    // 1. Verify Signature
    const data = `${headerB64}.${payloadB64}`;
    const hmac = createHmac("sha256", secret);
    hmac.update(data);
    const expectedSignature = hmac.digest("base64url");

    if (!timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSignature))) {
      return null;
    }

    // 2. Parse Payload
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // 3. Check Expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      log.warn("JWT expired", { sub: payload.sub, exp: payload.exp, now });
      return null;
    }

    return payload;
  } catch (err: any) {
    log.error("JWT verification failed", { error: err.message });
    return null;
  }
}
