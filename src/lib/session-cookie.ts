/**
 * HttpOnly session cookie for Wireline JWTs.
 * SameSite=Lax + Secure (prod) limits cross-site cookie sends on API POSTs.
 */
import type { Request, Response } from "express";
import type { CookieOptions } from "express-serve-static-core";

export const SESSION_COOKIE_NAME = "wireline_session";

/** Matches JWT lifetime in auth-service.generateToken */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 2;

const LEGACY_STORAGE_KEY = "wireline_session";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC * 1000,
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/",
  });
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

/** Bearer header first, then httpOnly session cookie. */
export function getSessionTokenFromRequest(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  if (bearer) return bearer || undefined;
  const cookies = parseCookieHeader(req.headers.cookie);
  const fromCookie = cookies[SESSION_COOKIE_NAME];
  return fromCookie || undefined;
}

export type AuthUserPayload = {
  id: string;
  email: string;
  full_name?: string | null;
  is_owner?: boolean;
};

/** JSON body for login/signup/oauth — token is never returned to the client. */
export function authSuccessBody(user: AuthUserPayload) {
  return { user };
}

export { LEGACY_STORAGE_KEY };
