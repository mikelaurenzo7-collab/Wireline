// Sentry — graceful no-op when VITE_SENTRY_DSN is not set so dev and
// preview deployments don't ship telemetry by default. Operator flips
// it on per-env from the Vercel dashboard.
//
// IMPORTANT: @sentry/react is ~100KB minified. Importing it
// statically pulls that weight into the initial bundle even when
// Sentry is disabled. We dynamically import it only when the DSN is
// configured, so DSN-less environments pay zero bytes for Sentry.
//
// To preserve early-error capture across that async boundary,
// captureException calls made before initSentry resolves are queued
// and flushed once the SDK has loaded (or routed to console.error
// when the operator hasn't configured a DSN). ErrorBoundary's
// componentDidCatch can fire well before the lazy import finishes
// on slow connections — without the buffer those startup errors
// would silently fall through.

type State = "pending" | "noop" | "ready";
type SentryNamespace = typeof import("@sentry/react");

let state: State = "pending";
let initStarted = false;
let sentryRef: SentryNamespace | null = null;
const pending: Array<{ error: unknown; context?: Record<string, unknown> }> = [];

// Cap the buffer so a render loop spamming errors can't grow it
// without bound while we're waiting for the dynamic import.
const PENDING_LIMIT = 50;

export async function initSentry() {
  if (initStarted) return;
  initStarted = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    state = "noop";
    flushPendingToConsole();
    return;
  }

  // If the chunk fails to load (CSP, blocked request, stale deploy,
  // network drop) we must still drain the buffer somewhere — otherwise
  // later captureException calls would silently append to a queue that
  // never flushes. Fall back to console output and mark the state as
  // "noop" so subsequent calls go straight to console too.
  let Sentry: SentryNamespace;
  try {
    Sentry = await import("@sentry/react");
  } catch (loadErr) {
    console.error("[wireline] Sentry SDK failed to load:", loadErr);
    state = "noop";
    flushPendingToConsole();
    return;
  }
  sentryRef = Sentry;

  try {
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
  } catch (initErr) {
    // Same shape as the import-load failure: SDK is loaded but init blew
    // up (bad DSN format, conflicting global state, etc.). Don't trap
    // future errors in the pending queue.
    console.error("[wireline] Sentry init failed:", initErr);
    sentryRef = null;
    state = "noop";
    flushPendingToConsole();
    return;
  }
  state = "ready";

  // Drain anything captured before the dynamic import resolved.
  while (pending.length) {
    const item = pending.shift()!;
    Sentry.captureException(item.error, item.context ? { extra: item.context } : undefined);
  }
}

function flushPendingToConsole() {
  while (pending.length) {
    const item = pending.shift()!;
    console.error("[wireline]", item.error, item.context);
  }
}

/** Capture a caught exception.
 *  - When init has resolved with a DSN: forwards to Sentry.
 *  - When init has resolved without a DSN: logs to console.
 *  - When init is still in flight: buffers, then drains via the path
 *    chosen by initSentry. Bounded at 50 entries to avoid runaway
 *    growth from render loops. */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (state === "ready" && sentryRef) {
    sentryRef.captureException(error, context ? { extra: context } : undefined);
    return;
  }
  if (state === "noop") {
    console.error("[wireline]", error, context);
    return;
  }
  pending.push({ error, context });
  if (pending.length > PENDING_LIMIT) pending.splice(0, pending.length - PENDING_LIMIT);
}

/** Get the live Sentry namespace. Returns null until init resolves. */
export function getSentry(): SentryNamespace | null {
  return sentryRef;
}
