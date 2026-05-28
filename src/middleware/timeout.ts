/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
import { log } from "../lib/server-context";
import { SentryEvents } from "../lib/sentry-events";

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
