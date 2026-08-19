import { BOTBOUND_BRAND_NAME, LEGACY_WIRELINE_NAME } from "./brand";

const DEFAULT_PRESERVED_TERMS = [
  "X-Wireline-Key",
  "X-Wireline-Token",
  "X-Wireline-Signature",
  "X-Wireline-Demo-Max-Seconds",
  "command@wireline.com",
] as const;

type BrandNormalizationOptions = {
  preserve?: readonly string[];
};

/**
 * Replace the retired customer-facing product name without touching stable
 * technical identifiers. This is intended for delivery boundaries (public
 * documents, long-lived provider prompt objects, connected-client payloads),
 * not for mutating persisted data or provider resources in place.
 */
export function normalizeCustomerBrandText(
  source: string,
  options: BrandNormalizationOptions = {},
): string {
  const preserved = [...DEFAULT_PRESERVED_TERMS, ...(options.preserve ?? [])];
  const placeholders = new Map<string, string>();
  let normalized = source;

  preserved.forEach((term, index) => {
    if (!term || !normalized.includes(term)) return;
    const placeholder = `__BOTBOUND_PRESERVE_${index}__`;
    placeholders.set(placeholder, term);
    normalized = normalized.split(term).join(placeholder);
  });

  const escapedLegacy = LEGACY_WIRELINE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  normalized = normalized.replace(
    new RegExp(`\\b${escapedLegacy}\\b`, "gi"),
    BOTBOUND_BRAND_NAME,
  );

  for (const [placeholder, term] of placeholders) {
    normalized = normalized.split(placeholder).join(term);
  }
  return normalized;
}

export function normalizeCustomerBrandDeep<T>(
  value: T,
  options: BrandNormalizationOptions = {},
): T {
  if (typeof value === "string") {
    return normalizeCustomerBrandText(value, options) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCustomerBrandDeep(item, options)) as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = normalizeCustomerBrandDeep(item, options);
    }
    return output as T;
  }
  return value;
}
