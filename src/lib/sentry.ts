// Lightweight error reporter. Ships browser exceptions to POST /api/health/report
// so they appear in Vercel runtime logs (zero external dependencies, zero cost).
// Server-side call sites fall back to console.error.

import { errorReportRoute } from "./error-report-route";
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
      // The server consumes only these diagnostic fields. Arbitrary context
      // can contain customer records, credentials, or circular objects.
      const payload = JSON.stringify({
        message,
        stack,
        url: errorReportRoute(window.location.href),
        context: context
          ? {
              ...(typeof context.errorClass === "string"
                ? { errorClass: sanitizeErrorMessage(context.errorClass).slice(0, 80) }
                : {}),
              ...(typeof context.componentStack === "string"
                ? { componentStack: sanitizeErrorMessage(context.componentStack) }
                : {}),
            }
          : undefined,
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
