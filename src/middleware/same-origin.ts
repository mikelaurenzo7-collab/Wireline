import type { NextFunction, Request, Response } from "express";
import { hasBearerAuthorization } from "../lib/session-cookie";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Vendor callbacks and cron hooks cannot send a browser Origin header. */
const ORIGIN_CHECK_SKIP_PREFIXES = [
  "/api/stripe-webhook",
  // Scope exemptions to specific public vendor receivers, not the whole
  // /api/webhooks/ tree, so future authenticated routes under that prefix
  // cannot silently inherit the CSRF exemption. Authenticity is established by
  // each provider's own signature verifier.
  "/api/webhooks/resend",
  "/api/webhooks/meta/",
  "/api/twilio-webhook",
  "/api/intake/lead",
  "/api/intake/leads",
  "/api/health",
  "/api/public/stats",
  // Native Wireline apps send Authorization: Bearer and usually omit
  // Origin/Referer. A dedicated bearer gate below rejects cookie-only mobile
  // requests before this same-origin exemption is applied.
  "/api/mobile/",
];

export function collectAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (appUrl) allowed.add(appUrl);
  for (const entry of (process.env.CORS_ORIGINS || "").split(",")) {
    const origin = entry.trim().replace(/\/+$/, "");
    if (origin) allowed.add(origin);
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  return allowed;
}

/**
 * True when a browser Origin header is acceptable for a credentialed request.
 * A missing Origin is allowed (non-browser clients, same-origin GETs that omit
 * it); a present Origin must be on the static allowlist OR match the request's
 * own forwarded host — the same allowance assertSameOrigin makes, so a genuinely
 * same-origin request from a deployment alias not listed in APP_URL/CORS_ORIGINS
 * is not rejected. Shared with the supervisor WebSocket upgrade so cookie-
 * authenticated sockets get the same cross-site protection HTTP mutations get.
 */
export function isAllowedBrowserOrigin(
  origin: string | undefined | null,
  selfOrigin?: string | null,
): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, "");
  if (collectAllowedOrigins().has(normalized)) return true;
  return Boolean(selfOrigin) && normalized === selfOrigin;
}

function originFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

type ForwardedHeaders = {
  "x-forwarded-host"?: string | string[];
  "x-forwarded-proto"?: string | string[];
  host?: string | string[];
};

/**
 * Resolve the request's own origin from forwarded proto + host headers.
 * A genuinely same-origin request (Origin/Referer host === the host the
 * browser actually hit) must always be trusted — this is the entire point
 * of a same-origin CSRF check. Relying solely on a static APP_URL/CORS_ORIGINS
 * allowlist breaks every deployment alias / preview whose domain is unknown
 * ahead of time even though the frontend and API share that same domain.
 *
 * Header-based so it works for both Express requests and raw upgrade
 * `IncomingMessage`s (the supervisor WebSocket), which never reach the HTTP
 * middleware but need the identical same-origin allowance.
 */
export function selfOriginFromHeaders(
  headers: ForwardedHeaders,
  protocolFallback?: string,
): string | null {
  const header = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value || "").split(",")[0].trim();
  const host = header(headers["x-forwarded-host"]) || header(headers.host);
  if (!host) return null;
  const proto = header(headers["x-forwarded-proto"]) || protocolFallback || "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function selfOrigin(req: Request): string | null {
  return selfOriginFromHeaders(req.headers, req.protocol);
}

/**
 * Reject cross-site mutating API requests when Origin/Referer do not match
 * APP_URL or CORS_ORIGINS. Complements SameSite=Lax session cookies.
 */
export function assertSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || req.url || "";

  if (path.startsWith("/api/mobile/") && !hasBearerAuthorization(req)) {
    res.status(401).json({
      error: "Mobile API requires Authorization: Bearer token.",
      code: "MOBILE_BEARER_REQUIRED",
      requestId: res.locals?.requestId,
    });
    return;
  }

  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  if (!path.startsWith("/api/")) {
    next();
    return;
  }
  if (ORIGIN_CHECK_SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    next();
    return;
  }

  const allowed = collectAllowedOrigins();
  const self = selfOrigin(req);
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin.replace(/\/+$/, "") : "";
  if (origin) {
    if (allowed.has(origin) || (self && origin === self)) {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-origin request blocked.", code: "CSRF_ORIGIN" });
    return;
  }

  const referer = typeof req.headers.referer === "string" ? req.headers.referer : "";
  if (referer) {
    const refererOrigin = originFromReferer(referer);
    if (refererOrigin && (allowed.has(refererOrigin) || (self && refererOrigin === self))) {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-origin request blocked.", code: "CSRF_ORIGIN" });
    return;
  }

  // Non-browser clients (curl, workers) may omit both; SameSite still applies to cookies.
  next();
}
