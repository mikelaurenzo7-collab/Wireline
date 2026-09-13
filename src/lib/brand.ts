export const BOTBOUND_BRAND = {
  name: "BotBound",
  technicalNamespace: "wireline",
  // Migration detector only. Never use this value as a customer-facing brand.
  legacyName: "Wireline",
  descriptor: "AI sales bots that answer leads, qualify buyers, and help book the next step.",
  canonicalProductionOrigin: "https://botbound.me",
  // Transition-only origin for external systems that have not completed the
  // domain cutover yet. Product links and new registrations use BotBound.
  legacyProductionOrigin: "https://trywireline.com",
} as const;

export const BOTBOUND_BRAND_NAME = BOTBOUND_BRAND.name;
export const BOTBOUND_PRODUCTION_ORIGIN = BOTBOUND_BRAND.canonicalProductionOrigin;
export const LEGACY_WIRELINE_NAME = BOTBOUND_BRAND.legacyName;
export const LEGACY_PRODUCTION_ORIGIN = BOTBOUND_BRAND.legacyProductionOrigin;

/**
 * BotBound is the sole forward product/company identity.
 *
 * The remaining `wireline` strings below the presentation layer are not a
 * second brand. They are stable storage/protocol identifiers: persisted keys,
 * database tables and migrations, native bridge names, environment variables,
 * API headers, and already-issued provider identifiers. Renaming those values
 * without a coordinated data/protocol migration creates avoidable breakage and
 * provides no customer-facing benefit.
 *
 * Likewise, the legacy origin/name exports exist only so migration guards can
 * detect and normalize old values while external provider dashboards finish
 * their cutover. New customer-visible content must resolve to BotBound.
 */
export const BRAND_COMPATIBILITY = {
  customerFacing: "BotBound",
  canonicalOrigin: BOTBOUND_PRODUCTION_ORIGIN,
  legacyOrigin: LEGACY_PRODUCTION_ORIGIN,
  technicalNamespace: "wireline",
} as const;
