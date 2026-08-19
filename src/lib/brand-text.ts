import { BOTBOUND_BRAND_NAME, LEGACY_WIRELINE_NAME } from "./brand";

const DEFAULT_PRESERVED_TERMS = [
  "X-Wireline-Key",
  "X-Wireline-Token",
  "X-Wireline-Signature",
  "X-Wireline-Demo-Max-Seconds",
  "command@wireline.com",
] as const;

/**
 * Known platform phrases that may still exist inside long-lived connected-app
 * templates. Keeping this list phrase-scoped avoids rewriting user-owned data
 * such as a Bot or customer business whose legitimate name is "Wireline".
 */
const PLATFORM_BRAND_PHRASES = [
  "Wireline account",
  "Wireline workspace",
  "Wireline agent draft",
  "Wireline agents",
  "Wireline agent",
  "Wireline Studio",
  "Wireline Wire",
  "Wireline Apps",
  "Wireline billing",
  "Wireline permission",
  "Wireline permissions",
  "Wireline MCP endpoint",
  "Wireline's MCP endpoint",
  "Wireline coaching brief",
  "Wireline voice agent",
  "Wireline voice agents",
  "Wireline system of record",
  "Wireline is the system of record",
  "Connect a Wireline",
  "connected Wireline",
  "registered for Wireline",
  "from Wireline",
  "in Wireline",
  "into Wireline",
  "to Wireline",
  "through Wireline",
  "inside Wireline",
  "by Wireline",
  "with Wireline",
  "for Wireline",
  "of Wireline",
  "Wireline requires",
  "Wireline registers",
  "Wireline could",
  "Wireline cannot",
  "Wireline can",
  "Wireline restores",
  "Wireline help",
  "Wireline user",
] as const;

type BrandNormalizationOptions = {
  preserve?: readonly string[];
};

/**
 * Replace the retired customer-facing product name without touching stable
 * technical identifiers. Use this only where the entire document is known to
 * be platform-authored (for example OpenAPI), not around arbitrary tenant data.
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

export function normalizePlatformBrandPhrases(source: string): string {
  let normalized = source;
  for (const phrase of PLATFORM_BRAND_PHRASES) {
    if (!normalized.includes(phrase)) continue;
    normalized = normalized.split(phrase).join(phrase.replace("Wireline", BOTBOUND_BRAND_NAME));
  }
  return normalized;
}

export function normalizePlatformBrandPhrasesDeep<T>(value: T): T {
  if (typeof value === "string") return normalizePlatformBrandPhrases(value) as T;
  if (Array.isArray(value)) return value.map(normalizePlatformBrandPhrasesDeep) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = normalizePlatformBrandPhrasesDeep(item);
    }
    return output as T;
  }
  return value;
}
