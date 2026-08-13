/**
 * HttpOnly session cookie for Wireline JWTs.
 * SameSite=Lax + Secure (prod) limits cross-site cookie sends on API POSTs.
 */
import type { CookieOptions } from "express-serve-static-core";
import type { Request, Response } from "express";

export const SESSION_COOKIE_NAME = "wireline_session";

/** Matches JWT lifetime in auth-service.generateToken */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 2;

const LEGACY_STORAGE_KEY = "wireline_session";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function baseCookieOptions(): Omit<CookieOptions, "maxAge"> {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
  };
}

export function sessionCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    maxAge: SESSION_MAX_AGE_SEC * 1000,
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions());
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/**
 * The one definition of "this request authenticates with a bearer token".
 * The same-origin CSRF gate exempts bearer surfaces (native apps) from the
 * Origin check, so it MUST agree exactly with the token reader below — a
 * tolerant gate plus a strict reader let `Authorization: bearer x` skip the
 * CSRF check and then silently authenticate from the victim's cookie.
 */
const BEARER_HEADER_RE = /^Bearer\s+(\S+)\s*$/i;

export function hasBearerAuthorization(req: Request): boolean {
  const header = req.headers.authorization;
  return typeof header === "string" && BEARER_HEADER_RE.test(header);
}

/** Bearer header first, then httpOnly session cookie. */
export function getSessionTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.trim() !== "") {
    // Any Authorization header claims header-based auth. Never fall through
    // to the session cookie here: a malformed bearer must fail as a 401, not
    // quietly ride cookie credentials past the bearer-only CSRF exemption.
    const match = BEARER_HEADER_RE.exec(authHeader);
    return match?.[1] || undefined;
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  const fromCookie = cookies[SESSION_COOKIE_NAME];
  return fromCookie || undefined;
}

export type AuthUserPayload = {
  id: string;
  email: string;
  full_name?: string | null;
  is_owner?: boolean;
  account_type?: "personal" | "business";
};

/** JSON body for login/signup/oauth — token is never returned to the client. */
export function authSuccessBody(user: AuthUserPayload) {
  return { user };
}

export { LEGACY_STORAGE_KEY };
