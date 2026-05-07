// Sentry — graceful no-op when VITE_SENTRY_DSN is not set so dev and
// preview deployments don't ship telemetry by default. Operator flips
// it on per-env from the Vercel dashboard.
//
// IMPORTANT: @sentry/react is ~100KB minified. Importing it
// statically pulls that weight into the initial bundle even when
// Sentry is disabled. We dynamically import it only when the DSN is
// configured, so DSN-less environments pay zero bytes for Sentry.

let initialized = false;
type SentryNamespace = typeof import("@sentry/react");
let sentryRef: SentryNamespace | null = null;

export async function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  const Sentry = await import("@sentry/react");
  sentryRef = Sentry;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Default sample rates — operator can override via VITE_SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Release tag picks up Vercel's auto-set commit SHA when present.
    release: (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined) || undefined,
    // Filter out noisy 'cancelled fetch' / 'AbortError' that fire when users
    // navigate away mid-request — those aren't real errors.
    beforeSend(event, hint) {
      const err = hint?.originalException as any;
      if (err?.name === "AbortError") return null;
      return event;
    },
  });
  initialized = true;
}

/** Capture a caught exception. No-ops when Sentry is not initialized. */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!initialized || !sentryRef) {
    // eslint-disable-next-line no-console
    console.error("[wireline]", error, context);
    return;
  }
  sentryRef.captureException(error, context ? { extra: context } : undefined);
}

/** Get the live Sentry namespace. Returns null until init resolves. */
export function getSentry(): SentryNamespace | null {
  return sentryRef;
}
