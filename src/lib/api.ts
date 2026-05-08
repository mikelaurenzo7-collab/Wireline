import { supabase } from "./supabase";

// Default per-request timeout for backend calls. Long enough for the
// slowest Claude paths (deep-think recipes ~ 60-90s) but bounded so
// the UI never spins forever on a stalled fetch.
const DEFAULT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Session token cache
// ---------------------------------------------------------------------------
// supabase.auth.getSession() involves an async local-storage read + token
// refresh check on every call. With 4+ concurrent authFetch calls on each
// dashboard poll (30 s interval) this adds up to hundreds of redundant
// async ticks per session. We cache the bearer token in memory and only
// refresh when the auth state actually changes or a 401 is returned.
// ---------------------------------------------------------------------------

let _cachedToken: string | null = null;

// Keep the cached token in sync with Supabase's session (handles logout,
// token refresh, and initial load). This listener is registered once at
// module level so it's always up to date regardless of component lifecycle.
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token ?? null;
});

// Populate synchronously on first import by piggybacking on the promise.
supabase.auth.getSession().then(({ data: { session } }) => {
  _cachedToken = session?.access_token ?? null;
});

async function getBearerToken(forceRefresh = false): Promise<string | null> {
  if (_cachedToken && !forceRefresh) return _cachedToken;
  const { data: { session } } = await supabase.auth.getSession();
  _cachedToken = session?.access_token ?? null;
  return _cachedToken;
}

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
    try { return anyFn.call(AbortSignal, live); } catch { /* fall through */ }
  }
  // Fallback: forward the first signal that aborts to a fresh controller.
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => controller.abort(s.reason);
  for (const s of live) {
    if (s.aborted) { onAbort(s); break; }
    s.addEventListener("abort", () => onAbort(s), { once: true });
  }
  return controller.signal;
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = await getBearerToken();

  const makeHeaders = (t: string | null) => ({
    ...options.headers,
    ...(t ? { "Authorization": `Bearer ${t}` } : {}),
  });

  // Always install the deadline. If the caller supplied a signal we
  // compose both so caller-driven cancellation still works while a
  // hung backend can't leave the UI waiting past DEFAULT_TIMEOUT_MS.
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? combineSignals(options.signal, timeoutCtrl.signal)
    : timeoutCtrl.signal;
  try {
    const res = await fetch(url, { ...options, headers: makeHeaders(token), signal });
    // Transparent token-refresh on 401: evict the stale cached token, get
    // a fresh one, then replay the request once. Handles the edge case where
    // the Supabase client has already issued a new token (e.g. after a
    // background refresh) but our cache still holds the old one.
    if (res.status === 401) {
      const freshToken = await getBearerToken(true);
      if (freshToken && freshToken !== token) {
        return await fetch(url, { ...options, headers: makeHeaders(freshToken), signal });
      }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
