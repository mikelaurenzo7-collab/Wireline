// Lightweight error reporter. Ships browser exceptions to POST /api/health/report
// so they appear in Vercel runtime logs (zero external dependencies, zero cost).
// Server-side call sites fall back to console.error.

import { errorReportRoute } from "./error-report-route";
import { errorReportContext } from "./error-report-context";
import { getErrorMessage, sanitizeErrorMessage } from "./server-utils";

type SentryNamespace = Record<string, never>;

export async function initSentry(): Promise<void> {
  return;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const message = getErrorMessage(error);
  const stack =
    error instanceof Error && error.stack ? sanitizeErrorMessage(error.stack) : undefined;

  if (typeof window !== "undefined") {
    try {
      // Preserve safe diagnostic labels without forwarding arbitrary customer
      // records, credentials, or circular objects from caller context.
      const payload = JSON.stringify({
        message,
        stack,
        url: errorReportRoute(window.location.href),
        context: errorReportContext(context),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/health/report",
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        fetch("/api/health/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // never let reporting throw
    }
  }

  console.error("[wireline]", message);
}

export function getSentry(): SentryNamespace | null {
  return null;
}
