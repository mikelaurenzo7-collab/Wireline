import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { getCanonicalAppUrl } from "../lib/app-url";
import {
  OAUTH_BRIDGE_STATE_COOKIE,
  clearOAuthBridgeStateCookie,
  readOAuthBridgeStateCookie,
} from "../lib/oauth-bridge-cookie";
import { generateOAuthState, verifyOAuthState } from "../lib/oauth-helpers";

type SignInOAuthProvider = "google" | "microsoft" | "yahoo";

const START_ROUTE = /^\/api\/auth\/(google|microsoft|yahoo)\/url$/;
const CALLBACK_ROUTE = /^\/api\/auth\/(google|microsoft|yahoo)\/callback$/;
const INVALID_STATE_MESSAGE = "Invalid or expired sign-in state. Please try again.";

function isSignInOAuthProvider(value: string): value is SignInOAuthProvider {
  return value === "google" || value === "microsoft" || value === "yahoo";
}

function oauthBridgeSecret(): string {
  const secret =
    process.env.OAUTH_BRIDGE_SECRET ||
    process.env.OAUTH_STATE_SECRET ||
    process.env.INTERNAL_JWT_SECRET ||
    process.env.JWT_SECRET;
  if (!secret) throw new Error("OAuth bridge secret is not configured.");
  return secret;
}

function hashOAuthBridgeValue(value: string): string {
  return createHmac("sha256", oauthBridgeSecret()).update(value, "utf8").digest("hex");
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function bindingMarker(provider: SignInOAuthProvider, bridgeState: string): string {
  return `signin:${provider}:${hashOAuthBridgeValue(bridgeState)}`;
}

/**
 * Creates a signed provider-specific state value bound to the browser's
 * HttpOnly OAuth bridge cookie. The raw cookie value never leaves Wireline.
 */
export function createBoundOAuthSignInState(
  provider: SignInOAuthProvider,
  bridgeState: string,
): string {
  return generateOAuthState({ userId: bindingMarker(provider, bridgeState) });
}

/**
 * Verifies the HMAC and TTL without claiming the nonce. The canonical OAuth
 * callback claims it only after this browser binding succeeds, so a request
 * without the cookie cannot burn a legitimate user's one-time state.
 */
export function isBoundOAuthSignInState(
  provider: SignInOAuthProvider,
  state: unknown,
  bridgeState: string | undefined,
): boolean {
  if (typeof state !== "string" || !bridgeState) return false;
  try {
    const verified = verifyOAuthState(state);
    if (!verified.ok || !verified.userId) return false;
    return safeStringEqual(verified.userId, bindingMarker(provider, bridgeState));
  } catch {
    return false;
  }
}

/**
 * Keeps Wireline's short-lived bridge code and sanitized error details out of
 * HTTP requests, access logs, and referrer headers. Provider callbacks still
 * use their required query parameters; only the internal SPA handoff changes.
 */
export function rewriteOAuthCompletionLocation(location: string): string {
  const isAbsolute = /^https?:\/\//i.test(location);
  try {
    const url = isAbsolute
      ? new URL(location)
      : new URL(location, "https://wireline.invalid");
    if (url.pathname !== "/auth/oauth-complete") return location;

    const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    let movedSensitiveValue = false;
    for (const key of ["code", "error"] as const) {
      const value = url.searchParams.get(key);
      if (!value) continue;
      fragment.set(key, value);
      url.searchParams.delete(key);
      movedSensitiveValue = true;
    }
    if (!movedSensitiveValue) return location;

    url.hash = fragment.toString();
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return location;
  }
}

function readBridgeStateFromSetCookie(res: Response): string | undefined {
  const rawHeader = res.getHeader("set-cookie");
  const headers = Array.isArray(rawHeader)
    ? rawHeader
    : typeof rawHeader === "string"
      ? [rawHeader]
      : [];

  for (let index = headers.length - 1; index >= 0; index -= 1) {
    const pair = headers[index]?.split(";", 1)[0] || "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    if (pair.slice(0, separator).trim() !== OAUTH_BRIDGE_STATE_COOKIE) continue;
    const encodedValue = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(encodedValue) || undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function rejectInvalidCallback(res: Response): Response {
  clearOAuthBridgeStateCookie(res);
  const error = encodeURIComponent(INVALID_STATE_MESSAGE);
  return res.redirect(`${getCanonicalAppUrl()}/auth/oauth-complete#error=${error}`);
}

function protectOAuthCompletionRedirect(res: Response): void {
  const originalRedirect = res.redirect.bind(res);
  res.redirect = ((statusOrUrl: number | string, maybeUrl?: string) => {
    if (typeof statusOrUrl === "number") {
      return originalRedirect(statusOrUrl, rewriteOAuthCompletionLocation(maybeUrl || ""));
    }
    return originalRedirect(rewriteOAuthCompletionLocation(statusOrUrl));
  }) as Response["redirect"];
}

const router = Router();

router.use((req: Request, res: Response, next) => {
  const startMatch = req.method === "GET" ? START_ROUTE.exec(req.path) : null;
  const startProvider = startMatch?.[1] || "";
  if (isSignInOAuthProvider(startProvider)) {
    const provider = startProvider;
    const originalJson = res.json.bind(res);

    res.json = ((body: unknown) => {
      if (res.statusCode >= 400 || !body || typeof body !== "object") {
        return originalJson(body);
      }

      const payload = body as Record<string, unknown>;
      if (typeof payload.url !== "string") return originalJson(body);

      const bridgeState = readBridgeStateFromSetCookie(res);
      if (!bridgeState) {
        res.status(500);
        return originalJson({ error: "Sign-in failed to start. Please try again." });
      }

      try {
        const authorizationUrl = new URL(payload.url);
        authorizationUrl.searchParams.set(
          "state",
          createBoundOAuthSignInState(provider, bridgeState),
        );
        return originalJson({ ...payload, url: authorizationUrl.toString() });
      } catch {
        res.status(500);
        return originalJson({ error: "Sign-in failed to start. Please try again." });
      }
    }) as Response["json"];

    return next();
  }

  const callbackMatch = req.method === "GET" ? CALLBACK_ROUTE.exec(req.path) : null;
  const callbackProvider = callbackMatch?.[1] || "";
  if (isSignInOAuthProvider(callbackProvider)) {
    const bridgeState = readOAuthBridgeStateCookie(req);
    if (!isBoundOAuthSignInState(callbackProvider, req.query.state, bridgeState)) {
      return rejectInvalidCallback(res);
    }
    protectOAuthCompletionRedirect(res);
  }

  return next();
});

export default router;
