/**
 * Brand token resolver.
 *
 * Returns a CSS color string suitable for inline style attributes (background, color)
 * use cases where a CSS variable cannot be embedded directly (e.g. when the
 * value is concatenated with a hex alpha suffix like `${accent}18` or fed into
 * a `linear-gradient(...)` template).
 *
 * The resolver reads `--color-brand` from the document root at call time so
 * palette changes propagate without component edits, matching the
 * Phase 2 token-driven sweep applied to TopBar / PageShell chrome. The
 * literal `#8B3FD6` is kept only as an SSR-safe fallback for the brief moment
 * before `document` is available.
 */
export const BRAND_FALLBACK = "#8B3FD6";

export function resolveBrandAccent(override?: string): string {
  if (override) return override;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return BRAND_FALLBACK;
  }
  const v = getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim();
  return v || BRAND_FALLBACK;
}
