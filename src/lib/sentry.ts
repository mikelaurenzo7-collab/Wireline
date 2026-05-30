// Lightweight error reporter. Ships browser exceptions to POST /api/health/report
// so they appear in Vercel runtime logs (zero external dependencies, zero cost).
// Server-side call sites fall back to console.error.

type SentryNamespace = Record<string, never>;

export async function initSentry(): Promise<void> {
  return;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  if (typeof window !== "undefined") {
    const payload = JSON.stringify({
      message,
      stack,
      url: window.location.href,
      context,
    });
    try {
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

   
  console.error("[wireline]", error, context);
}

export function getSentry(): SentryNamespace | null {
  return null;
}
