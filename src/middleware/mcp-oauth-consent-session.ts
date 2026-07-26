import { randomBytes, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";

import {
  SESSION_COOKIE_NAME,
  getSessionTokenFromRequest,
  parseCookieHeader,
} from "../lib/session-cookie";

const MCP_CONSENT_PATH = "/mcp/oauth/authorize";
const HANDOFF_COOKIE = "wireline_mcp_consent_session";
const CSRF_COOKIE = "wireline_mcp_consent_csrf";
const CSRF_FIELD = "oauth_consent_nonce";
const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

const parseConsentBody = express.urlencoded({ extended: false, limit: "64kb" });

function handoffCookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: true,
    sameSite: "none" as const,
    path: MCP_CONSENT_PATH,
    maxAge: HANDOFF_MAX_AGE_MS,
  };
}

function clearConsentCookies(res: Response): void {
  res.clearCookie(HANDOFF_COOKIE, handoffCookieOptions(true));
  res.clearCookie(CSRF_COOKIE, handoffCookieOptions(true));
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function injectConsentNonce(html: string, nonce: string): string {
  const hidden = `<input type="hidden" name="${CSRF_FIELD}" value="${nonce}" />`;
  const submit = '<button type="submit">';
  return html.includes(submit) ? html.replace(submit, `${hidden}${submit}`) : html;
}

/**
 * ChatGPT can complete the authenticated consent GET while omitting a Lax cookie
 * on the following consent POST inside its account-linking browser context. Keep
 * the global session cookie Lax, and bridge only this exact consent form with a
 * five-minute, path-scoped SameSite=None cookie protected by a double-submit
 * nonce that a cross-site origin cannot read.
 */
export function mcpOAuthConsentSessionBridge(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.path !== MCP_CONSENT_PATH) return next();

  if (req.method === "GET") {
    const sessionToken = getSessionTokenFromRequest(req);
    if (!sessionToken) return next();

    const nonce = randomBytes(24).toString("base64url");
    res.cookie(HANDOFF_COOKIE, sessionToken, handoffCookieOptions(true));
    res.cookie(CSRF_COOKIE, nonce, handoffCookieOptions(true));

    const send = res.send.bind(res);
    res.send = ((body: unknown) => {
      if (typeof body === "string" && res.statusCode < 400) {
        return send(injectConsentNonce(body, nonce));
      }
      return send(body);
    }) as typeof res.send;
    return next();
  }

  if (req.method !== "POST") return next();

  parseConsentBody(req, res, (parseError?: unknown) => {
    if (parseError) return next(parseError);
    if (getSessionTokenFromRequest(req)) return next();

    const cookies = parseCookieHeader(req.headers.cookie);
    const handoffSession = cookies[HANDOFF_COOKIE] || "";
    const cookieNonce = cookies[CSRF_COOKIE] || "";
    const bodyNonce =
      typeof (req.body as Record<string, unknown> | undefined)?.[CSRF_FIELD] === "string"
        ? String((req.body as Record<string, unknown>)[CSRF_FIELD])
        : "";

    if (
      !handoffSession ||
      !cookieNonce ||
      !bodyNonce ||
      cookieNonce.length > 128 ||
      bodyNonce.length > 128 ||
      !safeEqual(cookieNonce, bodyNonce)
    ) {
      clearConsentCookies(res);
      return next();
    }

    req.headers.authorization = `Bearer ${handoffSession}`;
    clearConsentCookies(res);
    return next();
  });
}

export const mcpOAuthConsentBridgeContract = {
  path: MCP_CONSENT_PATH,
  handoffCookie: HANDOFF_COOKIE,
  csrfCookie: CSRF_COOKIE,
  csrfField: CSRF_FIELD,
  maxAgeMs: HANDOFF_MAX_AGE_MS,
};
