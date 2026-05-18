// No-op Sentry shim. The SDK was removed pre-launch to drop the ~100KB
// frontend bundle weight and the $89/mo subscription floor. Vercel runtime
// logs cover the visible failure modes until paid telemetry is justified
// by traffic.
//
// Call sites (ErrorBoundary, WidgetBoundary, web-vitals, route handlers)
// still import from here unchanged — they get a silent console fallback.
// To re-enable Sentry: revert this file and reinstall @sentry/react.

type SentryNamespace = Record<string, never>;

export async function initSentry(): Promise<void> {
  return;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  console.error("[wireline]", error, context);
}

export function getSentry(): SentryNamespace | null {
  return null;
}
