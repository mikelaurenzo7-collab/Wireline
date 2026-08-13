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
 * it); a present Origin must be on the allowlist. Shared with the supervisor
 * WebSocket upgrade so cookie-authenticated sockets get the same cross-site
 * hijacking protection assertSameOrigin gives HTTP mutations.
 */
export function isAllowedBrowserOrigin(origin: string | undefined | null): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, "");
  return collectAllowedOrigins().has(normalized);
}

function originFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the request's own origin from forwarded proto + host headers.
 * A genuinely same-origin request (Origin/Referer host === the host the
 * browser actually hit) must always be trusted — this is the entire point
 * of a same-origin CSRF check. Relying solely on a static APP_URL/CORS_ORIGINS
 * allowlist breaks every Vercel preview deployment, whose domain is unknown
 * ahead of time even though the frontend and API share that same domain.
 */
function selfOrigin(req: Request): string | null {
  const host = (
    (typeof req.headers["x-forwarded-host"] === "string" && req.headers["x-forwarded-host"]) ||
    (typeof req.headers.host === "string" && req.headers.host) ||
    ""
  )
    .split(",")[0]
    .trim();
  if (!host) return null;
  const proto = (
    (typeof req.headers["x-forwarded-proto"] === "string" && req.headers["x-forwarded-proto"]) ||
    req.protocol ||
    "https"
  )
    .split(",")[0]
    .trim();
  return `${proto}://${host}`.replace(/\/+$/, "");
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
