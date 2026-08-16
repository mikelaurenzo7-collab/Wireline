/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
// Default per-request timeout for backend calls. Long enough for the
// slowest Claude paths (deep-think recipes ~ 60-90s) but bounded so
// the UI never spins forever on a stalled fetch.
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

const DEFAULT_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS;

export interface AuthFetchOptions extends RequestInit {
  /** Override the default 120s cap for a slow backend call. */
  timeoutMs?: number;
}

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
 * Codes the subscription gate returns inside a 402 response body. authFetch
 * detects these and emits a window event so any mounted checkout modal can
 * give the user a direct, truthful activation path.
 */
/**
 * Codes with bespoke copy in <TrialGateModal/>. Every OTHER 402 still opens
 * the modal — it falls through to the modal's default branch, which renders
 * the server's own message. This list is for documentation and typing only;
 * it is deliberately NOT a gate. See maybeDispatchTrialGateEvent.
 */
export const TRIAL_GATE_CODES = [
  "ACTIVATION_REQUIRED",
  "TRIAL_EXPIRED",
  "TRIAL_LIMIT_HIT",
  "SUBSCRIPTION_REQUIRED",
  "EMAIL_UNVERIFIED",
] as const;

/**
 * Custom event name. Listened to by <TrialGateModal/> mounted in the
 * AppShell. Exported so tests + other listeners can subscribe.
 */
export const TRIAL_GATE_EVENT = "wireline:trial-gate-block";

export interface TrialGateBlockDetail {
  /**
   * The 402 body's `code`. The listed values have bespoke copy in the modal;
   * any other code is carried through and rendered with the server's own
   * message, so a new paywall does not need a client change to be clickable.
   */
  code:
    | "ACTIVATION_REQUIRED"
    | "TRIAL_EXPIRED"
    | "TRIAL_LIMIT_HIT"
    | "SUBSCRIPTION_REQUIRED"
    | "EMAIL_UNVERIFIED"
    | (string & {});
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
    // Any 402 opens the gate. 402 Payment Required is definitionally "you must
    // pay to proceed", which is exactly this modal's trigger — and we already
    // returned above for every other status.
    //
    // This used to filter on a hand-curated allowlist, which had drifted badly:
    // AGENT_CAPACITY_REACHED, SPEND_CAP_REACHED, LIVE_PLAN_REQUIRED,
    // LIVE_VIDEO_BASE_PLAN_REQUIRED and the agent-cap 402 (whose code defaults
    // to "ERROR", since 402 has no entry in HTTP_STATUS_ERROR_CODES) were all
    // absent. Every one of those paywalls rendered a dead-end string telling
    // the user to upgrade, with nothing to click. The modal's default branch
    // already renders the server's message, so unknown codes degrade correctly.
    const code = typeof body?.code === "string" ? body.code : "";
    const detail: TrialGateBlockDetail = {
      code: code as TrialGateBlockDetail["code"],
      error: String(body?.error || "Subscription required"),
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
    // a subscription-gate 402 anyway. Skip.
  }
}

export const AUTH_SESSION_EXPIRED_EVENT = "wireline:auth-session-expired";

export interface AuthSessionExpiredDetail {
  status: number;
  code?: string;
  error: string;
  source: string;
}

/**
 * True only for authentication failures that mean the session is gone and the
 * user must sign in again. That is 401 exclusively — the auth middleware
 * returns 401 for every missing/expired/invalid-token case. 403 is
 * authorization (insufficient role, past-due billing, CSRF origin), which must
 * surface as an inline denial in the calling UI, not force a full sign-out.
 */
export function isAuthHttpStatus(status: number): boolean {
  return status === 401;
}

export const AUTH_SESSION_EXPIRED_MESSAGE = "Your session expired, sign in again to continue.";

/** Parse JSON or plain-text API error bodies from fetch responses. */
export function parseApiErrorFromText(text: string, status: number): ApiErrorBody {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as ApiErrorBody;
      if (parsed && typeof parsed.error === "string") return parsed;
    } catch {
      /* fall through */
    }
  }
  return { error: messageFromNonJsonBody(text, status) };
}

export function dispatchAuthSessionExpired(detail: AuthSessionExpiredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AuthSessionExpiredDetail>(AUTH_SESSION_EXPIRED_EVENT, { detail }),
  );
}

async function maybeDispatchAuthSessionExpired(response: Response, source: string): Promise<void> {
  if (!isAuthHttpStatus(response.status)) return;
  if (typeof window === "undefined") return;
  try {
    const cloned = response.clone();
    const text = await cloned.text();
    const body = parseApiErrorFromText(text, response.status);
    dispatchAuthSessionExpired({
      status: response.status,
      code: body.code,
      error: body.error,
      source,
    });
  } catch {
    dispatchAuthSessionExpired({
      status: response.status,
      error: AUTH_SESSION_EXPIRED_MESSAGE,
      source,
    });
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotate the httpOnly session cookie before long-lived streams. */
export async function refreshSessionIfNeeded(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        void maybeDispatchAuthSessionExpired(res, "/api/auth/refresh");
        return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Authenticated fetch wrapper. Injects JWT when present, adds cookies,
 * applies a bounded timeout, and emits session-expiry / subscription-gate
 * events before returning the original response to the caller.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: AuthFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, headers, ...rest } = init;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const mergedSignal = signal ? combineSignals(signal, controller.signal) : controller.signal;
  try {
    const mergedHeaders = new Headers(headers || {});
    // A string body is always JSON here, and express.json() only parses a
    // request that declares it. Callers that forgot the header sent a body
    // Express discarded, so the route saw `{}` and rejected every attempt —
    // Insights → Goals and both phone-number POSTs could never succeed.
    // Defaulted, not forced: an explicit Content-Type still wins, and non-string
    // bodies (FormData, Blob, URLSearchParams) keep the boundary the browser sets.
    if (typeof rest.body === "string" && !mergedHeaders.has("Content-Type")) {
      mergedHeaders.set("Content-Type", "application/json");
    }
    const response = await fetch(input, {
      ...rest,
      headers: mergedHeaders,
      credentials: "include",
      signal: mergedSignal,
    });
    void maybeDispatchTrialGateEvent(response);
    void maybeDispatchAuthSessionExpired(
      response,
      typeof input === "string" ? input : input.toString(),
    );
    return response;
  } finally {
    window.clearTimeout(timeout);
  }
}
