import type { NextFunction, Request, Response } from "express";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Vendor callbacks and cron hooks cannot send a browser Origin header. */
const ORIGIN_CHECK_SKIP_PREFIXES = [
  "/api/stripe-webhook",
  "/api/webhooks/",
  "/api/twilio-webhook",
  "/api/intake/",
  "/api/health",
  "/api/public-stats",
];

function collectAllowedOrigins(): Set<string> {
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

function originFromReferer(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Reject cross-site mutating API requests when Origin/Referer do not match
 * APP_URL or CORS_ORIGINS. Complements SameSite=Lax session cookies.
 */
export function assertSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  const path = req.path || req.url || "";
  if (!path.startsWith("/api/")) {
    next();
    return;
  }
  if (ORIGIN_CHECK_SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    next();
    return;
  }

  const allowed = collectAllowedOrigins();
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (origin) {
    if (allowed.has(origin)) {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-origin request blocked.", code: "CSRF_ORIGIN" });
    return;
  }

  const referer = typeof req.headers.referer === "string" ? req.headers.referer : "";
  if (referer) {
    const refererOrigin = originFromReferer(referer);
    if (refererOrigin && allowed.has(refererOrigin)) {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-origin request blocked.", code: "CSRF_ORIGIN" });
    return;
  }

  // Non-browser clients (curl, workers) may omit both; SameSite still applies to cookies.
  next();
}
