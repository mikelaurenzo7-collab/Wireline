// ────────────────────────────────────────────────────────────────────────
//  Safe date formatters.
//
//  Browsers disagree on what `new Date(invalidString).toLocaleString(...)`
//  should do:
//    - Chrome/Firefox: return the string "Invalid Date".
//    - Safari/iOS WebKit: throw RangeError with message
//      "The string did not match the expected pattern."
//
//  When the input comes from an API field that might be null, undefined,
//  an empty string, a Postgres timestamp with a space (rare), or an
//  unparsable string, the throw blows up the whole render. Every place
//  in this app that takes an API-supplied date string and runs it through
//  toLocale*() flows through the helpers below — they coerce
//  unparsable inputs to a stable fallback so the UI keeps rendering.
//
//  Pure functions only. Tested in tests/safe-date.test.ts.
// ────────────────────────────────────────────────────────────────────────

const DEFAULT_FALLBACK = "N/A";

/**
 * Coerce an arbitrary value into a Date that we can call toLocale*() on.
 * Returns null if the input is null/undefined/empty/unparsable.
 *
 * Handles:
 *  - undefined / null / "" / whitespace                  → null
 *  - already-a-Date that is Invalid                      → null
 *  - numeric strings (Unix ms)                           → Date
 *  - PostgreSQL/Supabase ISO-with-space variant
 *    "2026-01-15 10:30:00+00"                           → swap the space
 *                                                          for "T" and retry
 *  - anything `new Date()` rejects                       → null
 */
function toDate(input: unknown): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // First attempt — let the engine try as-is.
  const direct = new Date(trimmed);
  if (Number.isFinite(direct.getTime())) return direct;

  // Postgres timestamps sometimes serialize as "YYYY-MM-DD HH:MM:SS+00".
  // Safari rejects these but accepts the same string with a "T" between
  // date and time. Try once more with that swap.
  const swapped = trimmed.replace(" ", "T");
  if (swapped !== trimmed) {
    const retried = new Date(swapped);
    if (Number.isFinite(retried.getTime())) return retried;
  }

  return null;
}

/**
 * Wrap toLocaleString-family calls in a try/catch so we never throw,
 * even on engines that disagree about Invalid Date behavior.
 */
function safeFormat(d: Date, fn: (d: Date) => string, fallback: string): string {
  try {
    return fn(d);
  } catch {
    return fallback;
  }
}

/**
 * Format as a localized date (e.g. "Jan 15, 2026"). Empty / invalid → "—".
 */
export function formatDate(
  input: unknown,
  options?: Intl.DateTimeFormatOptions,
  fallback = DEFAULT_FALLBACK,
  locale?: string,
): string {
  const d = toDate(input);
  if (!d) return fallback;
  return safeFormat(d, (x) => x.toLocaleDateString(locale, options), fallback);
}

/**
 * Format as a localized date+time (e.g. "Jan 15, 2026, 10:30 AM").
 */
export function formatDateTime(
  input: unknown,
  options?: Intl.DateTimeFormatOptions,
  fallback = DEFAULT_FALLBACK,
  locale?: string,
): string {
  const d = toDate(input);
  if (!d) return fallback;
  return safeFormat(d, (x) => x.toLocaleString(locale, options), fallback);
}

/**
 * Format as a localized time (e.g. "10:30 AM").
 */
export function formatTime(
  input: unknown,
  options?: Intl.DateTimeFormatOptions,
  fallback = DEFAULT_FALLBACK,
  locale?: string,
): string {
  const d = toDate(input);
  if (!d) return fallback;
  return safeFormat(d, (x) => x.toLocaleTimeString(locale, options), fallback);
}

/**
 * Get a Date object from any input safely. Returns null if unparsable.
 * Use this when you need the underlying Date for further math (subtracting
 * timestamps, checking ranges) — never call .toLocaleX directly afterward.
 */
export function safeDate(input: unknown): Date | null {
  return toDate(input);
}

/**
 * Difference between an input date and now, in milliseconds. Returns null
 * for unparsable input — callers should branch on null rather than
 * rendering NaN.
 */
export function msSinceNow(input: unknown): number | null {
  const d = toDate(input);
  return d ? Date.now() - d.getTime() : null;
}

/**
 * "Time ago" formatter — coarse, English-only by design (the app's own
 * voice). Returns the fallback for unparsable input. Examples:
 *   "just now", "3m ago", "2h ago", "5d ago", "Mar 4"
 */
export function formatRelative(input: unknown, fallback = DEFAULT_FALLBACK): string {
  const d = toDate(input);
  if (!d) return fallback;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return safeFormat(d, (x) => x.toLocaleDateString(), fallback);
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return safeFormat(
    d,
    (x) => x.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    fallback,
  );
}
