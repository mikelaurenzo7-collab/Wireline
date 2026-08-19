export const BOTBOUND_BRAND = {
  name: "BotBound",
  technicalNamespace: "wireline",
  legacyName: "Wireline",
  descriptor: "AI employees for calls, texts, and email.",
  legacyProductionOrigin: "https://trywireline.com",
} as const;

export const BOTBOUND_BRAND_NAME = BOTBOUND_BRAND.name;
export const LEGACY_WIRELINE_NAME = BOTBOUND_BRAND.legacyName;
export const LEGACY_PRODUCTION_ORIGIN = BOTBOUND_BRAND.legacyProductionOrigin;

/**
 * Brand migration boundary:
 * - BotBound is the customer-facing product/company identity.
 * - `wireline` remains the compatibility namespace for stable persisted keys,
 *   routes, database roles/migrations, native bridge identifiers, and secrets.
 *
 * Renaming those technical identifiers is intentionally a separate migration
 * only when there is an operational reason to do it.
 */
export const BRAND_COMPATIBILITY = {
  customerFacing: "BotBound",
  technicalNamespace: "wireline",
} as const;
