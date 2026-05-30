/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// Default per-request timeout for backend calls. Long enough for the
// slowest Claude paths (deep-think recipes ~ 60-90s) but bounded so
// the UI never spins forever on a stalled fetch.
const DEFAULT_TIMEOUT_MS = 120_000;

// Logger stub for client-side (avoid console.error in production)
const logError = (message: string, ...args: any[]) => {
  if (process.env.NODE_ENV !== "production" && typeof console !== "undefined") {
    console.error(message, ...args);
  }
};

/**
 * Safely parses a fetch Response as JSON. If the body is not valid JSON
 * (e.g. an HTML error page from a reverse proxy), returns a generic error
 * object instead of throwing so callers never surface raw parse errors.
 */
export type ApiErrorBody = { error: string; code?: string };

/** True when safeJson fell back to a synthetic error object (non-JSON body). */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    !!value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as ApiErrorBody).error === "string" &&
    !("stages" in value) &&
    !("grid" in value) &&
    !("agents" in value) &&
    !("topics" in value) &&
    !("attribution" in value)
  );
}

function messageFromNonJsonBody(text: string, status: number): string {
  const trimmed = text.trim();
  // Handle HTML error pages from Vercel/Supabase/Nginx
  if (trimmed.startsWith("<") || trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    if (status === 502 || status === 503 || status === 504 || status === 500) {
      return "Our servers are temporarily busy. Please wait a moment and try again.";
    }
    return "The server returned an unexpected response. Please refresh and try again.";
  }
  // Handle plain text error messages
  if (
    /^A server error/i.test(trimmed) ||
    /^An error occurred/i.test(trimmed) ||
    /^Internal Server Error/i.test(trimmed)
  ) {
    return "The server is temporarily unavailable. Please try again in a few minutes.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The server is temporarily unavailable. Please try again shortly.";
  }
  if (status === 500) {
    return "Something went wrong on our end. Please try again.";
  }
  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (status === 401 || status === 403) {
    return "You're not authorized to do that. Please sign in again.";
  }
  // If it's short text, return it directly (might be a plain error message)
  if (trimmed.length > 0 && trimmed.length < 300 && !trimmed.includes("{")) {
    return trimmed;
  }
  return "An unexpected error occurred. Please try again.";
}

/**
 * Safely parses a fetch Response as JSON. Never throws SyntaxError — callers
 * should check `!response.ok` and `isApiErrorBody(data)` before using payloads.
 */
export async function safeJson<T = unknown>(response: Response): Promise<T | ApiErrorBody> {
  const text = await response.text();
  if (!text.trim()) {
    return { error: messageFromNonJsonBody(text, response.status) };
  }
  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    logError("JSON parse failed:", text.slice(0, 200), parseError);
    return { error: messageFromNonJsonBody(text, response.status), code: "PARSE_ERROR" };
  }
}

/**
 * authFetch + safeJson + normalized error extraction for UI callers.
 */
export async function readApiJson<T = Record<string, unknown>>(
  response: Response,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; code?: string }> {
  const body = await safeJson<T & ApiErrorBody>(response);
  if (!response.ok) {
    const err = isApiErrorBody(body) ? body : (body as ApiErrorBody);
    return {
      ok: false,
      status: response.status,
      error: err?.error || `Request failed (${response.status})`,
      code: err?.code,
    };
  }
  if (isApiErrorBody(body)) {
    return { ok: false, status: response.status, error: body.error };
  }
  return { ok: true, data: body as T };
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

function parseJwtExp(token: string): number | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function maybeRefreshToken(token: string): Promise<string> {
  const exp = parseJwtExp(token);
  if (!exp) return token;
  const remainingSec = exp - Math.floor(Date.now() / 1000);
  if (remainingSec > 15 * 60) return token;

  if (refreshInFlight) {
    const result = await refreshInFlight;
    return result ?? token;
  }

  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return null;
      const body = await res.json();
      if (!body?.token) return null;
      const sessionJson = localStorage.getItem("wireline_session");
      if (sessionJson) {
        try {
          const session = JSON.parse(sessionJson);
          session.access_token = body.token;
          localStorage.setItem("wireline_session", JSON.stringify(session));
        } catch {
          /* keep existing session */
        }
      }
      return body.token as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  const result = await refreshInFlight;
  return result ?? token;
}

/**
 * Read the current access token from local storage without triggering a refresh.
 * Used by EventSource consumers, which cannot send an Authorization header and
 * must pass the bearer token as a `?token=` query parameter instead.
 */
export function getAccessToken(): string | null {
  const sessionJson = localStorage.getItem("wireline_session");
  if (!sessionJson) return null;
  try {
    const session = JSON.parse(sessionJson);
    return session?.access_token || null;
  } catch {
    return null;
  }
}

export async function authFetch(url: string, options: RequestInit = {}) {
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

  if (token && !url.includes("/api/auth/refresh")) {
    token = await maybeRefreshToken(token);
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
