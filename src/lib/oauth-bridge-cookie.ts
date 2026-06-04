import { randomBytes } from "node:crypto";
import type { CookieOptions } from "express-serve-static-core";
import type { Request, Response } from "express";
import { baseCookieOptions, parseCookieHeader } from "./session-cookie";

export const OAUTH_BRIDGE_STATE_COOKIE = "oauth_bridge_state";
const BRIDGE_STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function createOAuthBridgeState(): string {
  return randomBytes(32).toString("base64url");
}

export function oauthBridgeStateCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    maxAge: BRIDGE_STATE_MAX_AGE_MS,
  };
}

export function setOAuthBridgeStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_BRIDGE_STATE_COOKIE, state, oauthBridgeStateCookieOptions());
}

export function readOAuthBridgeStateCookie(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie);
  const value = cookies[OAUTH_BRIDGE_STATE_COOKIE];
  return value?.trim() || undefined;
}

export function clearOAuthBridgeStateCookie(res: Response): void {
  res.clearCookie(OAUTH_BRIDGE_STATE_COOKIE, oauthBridgeStateCookieOptions());
}
