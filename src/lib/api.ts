/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// Default per-request timeout for backend calls. Long enough for the
// slowest Claude paths (deep-think recipes ~ 60-90s) but bounded so
// the UI never spins forever on a stalled fetch.
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Safely parses a fetch Response as JSON. If the body is not valid JSON
 * (e.g. an HTML error page from a reverse proxy), returns a generic error
 * object instead of throwing so callers never surface raw parse errors.
 */
export async function safeJson<T = any>(response: Response): Promise<T | { error: string }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    console.error("JSON parse failed:", text.slice(0, 200), parseError);
    return { error: "An unexpected error occurred. Please try again." };
  }
}

// Compose a caller's AbortSignal with our request-timeout signal so
// `authFetch` always enforces DEFAULT_TIMEOUT_MS even when the caller
// owns cancellation. Prefers the native AbortSignal.any() (Chromium 116+
// / FF 124+ / Safari 17.4+) and falls back to a manual listener bridge
// for older runtimes.
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 1) return live[0];
  // Try the native AbortSignal.any first (Chromium 116+, FF 124+, Safari
  // 17.4+). Some test runtimes (notably happy-dom) ship a broken stub
  // that throws when invoked; treat that as "not available" and fall
  // through to the manual bridge instead of propagating the failure.
  type AnyFn = (this: typeof AbortSignal, signals: AbortSignal[]) => AbortSignal;
  const anyFn = (AbortSignal as unknown as { any?: AnyFn }).any;
  if (typeof anyFn === "function") {
    try {
      return anyFn.call(AbortSignal, live);
    } catch {
      /* fall through */
    }
  }
  // Fallback: forward the first signal that aborts to a fresh controller.
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => controller.abort(s.reason);
  for (const s of live) {
    if (s.aborted) {
      onAbort(s);
      break;
    }
    s.addEventListener("abort", () => onAbort(s), { once: true });
  }
  return controller.signal;
}

/**
 * Codes the trial gate (src/lib/trial-gate.ts) returns inside a 402
 * response body. authFetch detects these and emits a window event so
 * any mounted upgrade modal can pop without each caller having to
 * handle the 402 manually.
 */
const TRIAL_GATE_CODES = new Set([
  "TRIAL_EXPIRED",
  "TRIAL_LIMIT_HIT",
  "SUBSCRIPTION_REQUIRED",
  "EMAIL_UNVERIFIED",
]);

/**
 * Custom event name. Listened to by <TrialGateModal/> mounted in the
 * AppShell. Exported so tests + other listeners can subscribe.
 */
export const TRIAL_GATE_EVENT = "wireline:trial-gate-block";

export interface TrialGateBlockDetail {
  code: "TRIAL_EXPIRED" | "TRIAL_LIMIT_HIT" | "SUBSCRIPTION_REQUIRED" | "EMAIL_UNVERIFIED";
  error: string;
  /** Present on TRIAL_LIMIT_HIT */
  limit?: number;
  current?: number;
  /** Present on TRIAL_LIMIT_HIT during the trial window */
  days_left?: number | null;
  /** Present on TRIAL_EXPIRED */
  trial_ended_at?: string | null;
}

/**
 * Best-effort 402 sniffer. Clones the response so the caller can still
 * read the body normally. Silently no-ops in non-browser contexts (SSR,
 * test runners without `window`).
 */
async function maybeDispatchTrialGateEvent(response: Response): Promise<void> {
  if (response.status !== 402) return;
  if (typeof window === "undefined") return;
  try {
    const cloned = response.clone();
    const body = (await cloned.json()) as Record<string, any>;
    const code = typeof body?.code === "string" ? body.code : "";
    if (!TRIAL_GATE_CODES.has(code)) return;
    const detail: TrialGateBlockDetail = {
      code: code as TrialGateBlockDetail["code"],
      error: String(body?.error || "Trial gate hit"),
      limit: typeof body?.limit === "number" ? body.limit : undefined,
      current: typeof body?.current === "number" ? body.current : undefined,
      days_left:
        typeof body?.days_left === "number" || body?.days_left === null
          ? body.days_left
          : undefined,
      trial_ended_at:
        typeof body?.trial_ended_at === "string" || body?.trial_ended_at === null
          ? body.trial_ended_at
          : undefined,
    };
    window.dispatchEvent(new CustomEvent<TrialGateBlockDetail>(TRIAL_GATE_EVENT, { detail }));
  } catch {
    // Body wasn't JSON, or parsing failed — caller probably didn't get
    // a trial-gate 402 anyway. Skip.
  }
}

export async function authFetch(url: string, options: RequestInit = {}) {
  // AuthContext stores session as "wireline_session" with { access_token, user }
  const sessionJson = localStorage.getItem("wireline_session");
  let token: string | null = null;
  if (sessionJson) {
    try {
      const session = JSON.parse(sessionJson);
      token = session?.access_token || null;
    } catch {
      token = null;
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Always install the deadline. If the caller supplied a signal we
  // compose both so caller-driven cancellation still works while a
  // hung backend can't leave the UI waiting past DEFAULT_TIMEOUT_MS.
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? combineSignals(options.signal, timeoutCtrl.signal)
    : timeoutCtrl.signal;
  try {
    const response = await fetch(url, { ...options, headers, signal });
    // Fire-and-forget global trial-gate detection. Never await — the
    // caller's contract is "I get a Response back immediately." The
    // modal listener handles whatever the event carries.
    void maybeDispatchTrialGateEvent(response);
    return response;
  } finally {
    clearTimeout(timer);
  }
}
