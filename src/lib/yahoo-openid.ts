import { randomBytes, timingSafeEqual, webcrypto } from "node:crypto";

const YAHOO_ISSUER = "https://api.login.yahoo.com";
const YAHOO_JWKS_URI = "https://api.login.yahoo.com/openid/v1/certs";
const YAHOO_JWKS_CACHE_MS = 6 * 60 * 60 * 1000;
const YAHOO_JWKS_TIMEOUT_MS = 5_000;
const CLOCK_TOLERANCE_SECONDS = 60;
const MAX_ID_TOKEN_LENGTH = 16_384;

type YahooJwtHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

type YahooJwtClaims = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  given_name?: unknown;
};

type YahooJwk = JsonWebKey & {
  alg?: string;
  kid?: string;
  use?: string;
};

type YahooJwks = {
  keys: YahooJwk[];
};

export type YahooVerifiedIdentity = {
  subject: string;
  email: string;
  fullName: string | null;
};

export type VerifyYahooIdTokenOptions = {
  clientId: string;
  nonce: string | undefined;
  nowMs?: number;
  fetchImpl?: typeof fetch;
};

let cachedJwks: { value: YahooJwks; expiresAt: number } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function decodeJsonSegment<T>(value: string, label: string): T {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} is not an object`);
    }
    return parsed as T;
  } catch {
    throw new Error(`Yahoo ID token has an invalid ${label}.`);
  }
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function audienceIncludes(audience: unknown, clientId: string): boolean {
  if (typeof audience === "string") return safeStringEqual(audience, clientId);
  if (!Array.isArray(audience)) return false;
  return audience.some((entry) => typeof entry === "string" && safeStringEqual(entry, clientId));
}

function parseCacheMaxAge(value: string | null): number | null {
  const match = value?.match(/(?:^|,)\s*max-age=(\d+)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

async function fetchYahooJwks(
  fetchImpl: typeof fetch,
  forceRefresh = false,
): Promise<YahooJwks> {
  if (!forceRefresh && fetchImpl === fetch && cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_JWKS_TIMEOUT_MS);
  try {
    const response = await fetchImpl(YAHOO_JWKS_URI, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Yahoo JWKS request failed (${response.status}).`);
    }
    const body = (await response.json()) as Partial<YahooJwks>;
    if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20) {
      throw new Error("Yahoo JWKS response is invalid.");
    }
    const value = { keys: body.keys } as YahooJwks;
    if (fetchImpl === fetch) {
      const cacheMs = Math.min(
        parseCacheMaxAge(response.headers.get("cache-control")) ?? YAHOO_JWKS_CACHE_MS,
        YAHOO_JWKS_CACHE_MS,
      );
      cachedJwks = { value, expiresAt: Date.now() + cacheMs };
    }
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

function importAlgorithm(alg: string): RsaHashedImportParams | EcKeyImportParams {
  if (alg === "RS256") {
    return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  }
  if (alg === "ES256") {
    return { name: "ECDSA", namedCurve: "P-256" };
  }
  throw new Error("Yahoo ID token uses an unsupported signing algorithm.");
}

function verifyAlgorithm(alg: string): AlgorithmIdentifier | EcdsaParams {
  if (alg === "RS256") return { name: "RSASSA-PKCS1-v1_5" };
  if (alg === "ES256") return { name: "ECDSA", hash: "SHA-256" };
  throw new Error("Yahoo ID token uses an unsupported signing algorithm.");
}

function findSigningKey(jwks: YahooJwks, kid: string, alg: string): YahooJwk | undefined {
  return jwks.keys.find(
    (candidate) =>
      candidate.kid === kid &&
      (!candidate.alg || candidate.alg === alg) &&
      (!candidate.use || candidate.use === "sig"),
  );
}

async function verifySignature(
  signingInput: string,
  signatureSegment: string,
  header: YahooJwtHeader,
  fetchImpl: typeof fetch,
): Promise<void> {
  const alg = typeof header.alg === "string" ? header.alg : "";
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!kid || (alg !== "RS256" && alg !== "ES256")) {
    throw new Error("Yahoo ID token header is invalid.");
  }

  let jwks = await fetchYahooJwks(fetchImpl);
  let jwk = findSigningKey(jwks, kid, alg);
  if (!jwk) {
    // Yahoo may rotate signing keys before the cached JWKS expires. Refresh
    // exactly once for an unknown kid, then continue to fail closed.
    jwks = await fetchYahooJwks(fetchImpl, true);
    jwk = findSigningKey(jwks, kid, alg);
  }
  if (!jwk) throw new Error("Yahoo ID token signing key was not found.");

  const key = await webcrypto.subtle.importKey("jwk", jwk, importAlgorithm(alg), false, ["verify"]);
  const verified = await webcrypto.subtle.verify(
    verifyAlgorithm(alg),
    key,
    decodeBase64Url(signatureSegment),
    new TextEncoder().encode(signingInput),
  );
  if (!verified) throw new Error("Yahoo ID token signature is invalid.");
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || !normalized.includes("@")) return null;
  return normalized;
}

function normalizeName(claims: YahooJwtClaims): string | null {
  const candidate =
    typeof claims.name === "string"
      ? claims.name
      : typeof claims.given_name === "string"
        ? claims.given_name
        : "";
  const normalized = candidate.trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function validateClaims(
  claims: YahooJwtClaims,
  options: VerifyYahooIdTokenOptions,
): YahooVerifiedIdentity {
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (claims.iss !== YAHOO_ISSUER) throw new Error("Yahoo ID token issuer is invalid.");
  if (!audienceIncludes(claims.aud, options.clientId)) {
    throw new Error("Yahoo ID token audience is invalid.");
  }
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== options.clientId) {
    throw new Error("Yahoo ID token authorized party is invalid.");
  }
  if (typeof claims.exp !== "number" || claims.exp < nowSeconds - CLOCK_TOLERANCE_SECONDS) {
    throw new Error("Yahoo ID token is expired.");
  }
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw new Error("Yahoo ID token issued-at time is invalid.");
  }
  if (
    typeof claims.nbf === "number" &&
    claims.nbf > nowSeconds + CLOCK_TOLERANCE_SECONDS
  ) {
    throw new Error("Yahoo ID token is not active yet.");
  }
  if (
    !options.nonce ||
    typeof claims.nonce !== "string" ||
    !safeStringEqual(claims.nonce, options.nonce)
  ) {
    throw new Error("Yahoo ID token nonce is invalid.");
  }
  if (typeof claims.sub !== "string" || !claims.sub.trim() || claims.sub.length > 255) {
    throw new Error("Yahoo ID token subject is invalid.");
  }
  if (claims.email_verified !== true) {
    throw new Error("Yahoo did not verify ownership of the email address.");
  }
  const email = normalizeEmail(claims.email);
  if (!email) throw new Error("Yahoo ID token email is invalid.");

  return {
    subject: claims.sub,
    email,
    fullName: normalizeName(claims),
  };
}

/** Generate the per-authorization nonce Yahoo requires for OpenID Connect. */
export function createYahooOidcNonce(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Verify a Yahoo ID token end to end: JWS signature, issuer, audience, expiry,
 * issued-at/not-before times, browser-bound nonce, subject, and verified email.
 */
export async function verifyYahooIdToken(
  idToken: string | undefined,
  options: VerifyYahooIdTokenOptions,
): Promise<YahooVerifiedIdentity> {
  if (!idToken || idToken.length > MAX_ID_TOKEN_LENGTH) {
    throw new Error("Yahoo did not return a valid ID token.");
  }
  if (!options.clientId?.trim()) throw new Error("Yahoo client ID is not configured.");

  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Yahoo ID token is malformed.");
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeJsonSegment<YahooJwtHeader>(headerSegment, "header");
  const claims = decodeJsonSegment<YahooJwtClaims>(payloadSegment, "payload");
  await verifySignature(
    `${headerSegment}.${payloadSegment}`,
    signatureSegment,
    header,
    options.fetchImpl ?? fetch,
  );
  return validateClaims(claims, options);
}
