import { supabase } from "./supabase";

// Default per-request timeout for backend calls. Long enough for the
// slowest Claude paths (deep-think recipes ~ 60-90s) but bounded so
// the UI never spins forever on a stalled fetch.
const DEFAULT_TIMEOUT_MS = 120_000;

export async function authFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = {
    ...options.headers,
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  // Honor a caller-provided AbortSignal if present; otherwise install our
  // own deadline. We don't override an explicit signal so callers that
  // already manage cancellation (e.g. streaming endpoints) keep control.
  if (options.signal) {
    return fetch(url, { ...options, headers });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
