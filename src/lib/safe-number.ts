// ────────────────────────────────────────────────────────────────────────
//  Safe number formatters.
//
//  `apiField.toFixed(2)` throws TypeError when apiField is null/undefined,
//  and returns the literal string "NaN" when apiField is NaN. Both crash
//  the surrounding render. These helpers coerce to a finite number first
//  and yield a stable fallback when that fails.
//
//  Same shape as src/lib/safe-date.ts — pure functions only, tested in
//  tests/safe-number.test.ts.
// ────────────────────────────────────────────────────────────────────────

/**
 * Coerce an arbitrary value into a finite number. Returns null on any
 * input that JavaScript would parse as NaN / Infinity.
 *
 *   "12.5"        → 12.5
 *   "12.5px"      → null (parseFloat *would* return 12.5; we reject
 *                   it because the API contract said this field
 *                   should be a number, not a CSS string)
 *   null/undefined → null
 *   NaN/Infinity   → null
 */
export function safeNumber(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return null;
    // Reject strings that aren't pure numerics — Number("12.5px") is
    // NaN, but Number("12.5") is 12.5. Number("") is 0, which is wrong
    // for our purposes (treat empty as missing, not zero).
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof input === "boolean") return input ? 1 : 0;
  return null;
}

/**
 * Format as a fixed-decimal string. Never throws. Returns the fallback
 * for null / undefined / NaN / unparsable input.
 *
 *   safeFixed(3.14159, 2)  → "3.14"
 *   safeFixed(null, 2)     → "0.00"   (default fallback derived from decimals)
 *   safeFixed("nope", 2, "—") → "—"
 */
export function safeFixed(input: unknown, decimals: number, fallback?: string): string {
  const n = safeNumber(input);
  if (n == null) {
    if (fallback != null) return fallback;
    // Default fallback matches the shape of a real result so the UI doesn't
    // flicker between "—" and "0.00" when an API response is partial.
    return (0).toFixed(Math.max(0, decimals | 0));
  }
  try {
    return n.toFixed(Math.max(0, decimals | 0));
  } catch {
    return fallback ?? (0).toFixed(Math.max(0, decimals | 0));
  }
}

/**
 * USD money formatter — adds the dollar sign and uses a sensible default
 * decimal count (2 for human-facing totals, callers can override).
 *
 *   formatMoney(12.5)       → "$12.50"
 *   formatMoney(null)       → "$0.00"
 *   formatMoney(0.0042, 4)  → "$0.0042"
 */
export function formatMoney(input: unknown, decimals = 2, fallback?: string): string {
  return `$${safeFixed(input, decimals, fallback)}`;
}

/**
 * Percent formatter — input is a fraction (0..1) by default. Pass
 * `alreadyScaled: true` if your input is already in 0..100 form.
 *
 *   formatPercent(0.123)              → "12%"
 *   formatPercent(12.3, 0, true)       → "12%"
 *   formatPercent(null)                → "0%"
 */
export function formatPercent(
  input: unknown,
  decimals = 0,
  alreadyScaled = false,
  fallback?: string,
): string {
  const n = safeNumber(input);
  if (n == null) return fallback ?? `${(0).toFixed(Math.max(0, decimals | 0))}%`;
  const scaled = alreadyScaled ? n : n * 100;
  return `${safeFixed(scaled, decimals)}%`;
}

/**
 * Integer formatter with thousands separator, never throws.
 *
 *   formatInt(1234567)  → "1,234,567"
 *   formatInt(null)     → "0"
 */
export function formatInt(input: unknown, fallback?: string): string {
  const n = safeNumber(input);
  if (n == null) return fallback ?? "0";
  try {
    return Math.round(n).toLocaleString();
  } catch {
    return fallback ?? "0";
  }
}

/**
 * Human-friendly phone formatter, never throws. Strips non-digits then formats
 * North American 10/11-digit numbers as "+1 (555) 123-4567". Falls back to the
 * raw input for anything that doesn't match a known pattern.
 *
 *   formatPhone("15551234567")  → "+1 (555) 123-4567"
 *   formatPhone("5551234567")   → "(555) 123-4567"
 *   formatPhone("+44 20 7946")  → "+44 20 7946"  (passthrough — not NANP)
 */
export function formatPhone(input: unknown, fallback?: string): string {
  if (input == null) return fallback ?? "";
  const raw = String(input).trim();
  if (!raw) return fallback ?? "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}
