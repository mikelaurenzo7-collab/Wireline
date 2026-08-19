export const BOTBOUND_BRAND = {
  name: "BotBound",
  technicalNamespace: "wireline",
  legacyName: "Wireline",
  descriptor: "AI employees for calls, texts, and email.",
  canonicalProductionOrigin: "https://botbound.me",
  legacyProductionOrigin: "https://trywireline.com",
} as const;

export const BOTBOUND_BRAND_NAME = BOTBOUND_BRAND.name;
export const BOTBOUND_PRODUCTION_ORIGIN = BOTBOUND_BRAND.canonicalProductionOrigin;
export const LEGACY_WIRELINE_NAME = BOTBOUND_BRAND.legacyName;
export const LEGACY_PRODUCTION_ORIGIN = BOTBOUND_BRAND.legacyProductionOrigin;

/**
 * Brand migration boundary:
 * - BotBound is the customer-facing product/company identity.
 * - botbound.me is the canonical production origin after domain cutover.
 * - trywireline.com remains a transition origin until provider callbacks,
 *   webhooks, email links, and external registrations are proven on BotBound.
 * - `wireline` remains the compatibility namespace for stable persisted keys,
 *   routes, database roles/migrations, native bridge identifiers, and secrets.
 *
 * Renaming those technical identifiers is intentionally a separate migration
 * only when there is an operational reason to do it.
 */
export const BRAND_COMPATIBILITY = {
  customerFacing: "BotBound",
  canonicalOrigin: BOTBOUND_PRODUCTION_ORIGIN,
  legacyOrigin: LEGACY_PRODUCTION_ORIGIN,
  technicalNamespace: "wireline",
} as const;
