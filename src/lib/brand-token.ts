/**
 * Returns a CSS color suitable for the small number of legacy call sites that
 * require a literal value. The active product foundation is monochrome.
 */
export const BRAND_FALLBACK = "#1D1D1F";

export function resolveBrandAccent(override?: string): string {
  if (override) return override;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return BRAND_FALLBACK;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-brand").trim();
  return value || BRAND_FALLBACK;
}
