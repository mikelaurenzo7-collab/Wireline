/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
import { log } from "../lib/server-context";
import { SentryEvents } from "../lib/sentry-events";

/** Paths that mount their own timeout earlier in server.ts — skip the default /api cap. */
const DEDICATED_API_TIMEOUT_PREFIXES = [
  "/api/director",
  "/api/claude",
  "/api/emails",
  "/api/phone-numbers",
  "/api/campaigns",
] as const;

function requestPath(req: { originalUrl?: string; path?: string }): string {
  const raw = String(req.originalUrl || req.path || "");
  return raw.split("?")[0] ?? raw;
}

/**
 * Default 20s cap for /api/* routes without a dedicated longer timeout.
 * Director, Claude, emails, etc. mount their own limits — do not stack both or
 * the shorter timer always wins (504s on long Director turns).
 */
export function defaultApiTimeoutMiddleware(req: unknown, res: unknown, next: () => void) {
  const path = requestPath(req as { originalUrl?: string; path?: string });
  if (DEDICATED_API_TIMEOUT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return next();
  }
  return timeoutMiddleware(20_000)(req, res, next);
}

/**
 * Request timeout middleware — prevents hung requests from accumulating connections.
 */
export function timeoutMiddleware(timeoutMs: number) {
  return (req: any, res: any, next: any) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        const endpoint = req.originalUrl || req.path;
        log.warn("Request timeout", {
          requestId: res.locals?.requestId,
          endpoint,
          timeoutMs,
          method: req.method,
        });
        SentryEvents.slowOperation({
          operation: `${req.method} ${endpoint}`,
          duration_ms: timeoutMs,
          threshold_ms: timeoutMs,
        });
        res
          .status(504)
          .json({ error: "Request timeout — operation took too long", code: "REQUEST_TIMEOUT" });
        res.socket?.destroy();
      }
    }, timeoutMs);

    res.on("finish", () => clearTimeout(timer));
    res.on("close", () => clearTimeout(timer));
    next();
  };
}
