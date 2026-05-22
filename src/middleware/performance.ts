/* eslint-disable @typescript-eslint/no-explicit-any -- Express middleware operates on heterogeneous request/response shapes. */
import { SentryEvents } from "../lib/sentry-events";

/**
 * Performance monitoring middleware — track slow operations on critical paths.
 */
export function performanceMonitoring(slowThresholdMs: number = 2000) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const originalSend = res.send;

    res.send = function (data: any) {
      const duration = Date.now() - start;

      // Track slow operations for critical endpoints
      if (
        duration > slowThresholdMs &&
        /api\/(claude|emails|campaigns|knowledge|agents)/.test(req.path)
      ) {
        SentryEvents.slowOperation({
          operation: `${req.method} ${req.path}`,
          duration_ms: duration,
          threshold_ms: slowThresholdMs,
        });
      }

      res.send = originalSend;
      return originalSend.call(this, data);
    };

    next();
  };
}
