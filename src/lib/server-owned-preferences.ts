/**
 * Preference namespaces that only their own routes write. The canonical
 * preference writer (`user-preference-guard-routes.ts`) keeps them from any
 * client-supplied envelope: Company Identity's review state, and the sealed
 * texting registration details.
 */
export const SERVER_OWNED_PREFERENCE_KEYS = ["company_identity", "texting_registration"] as const;

/** Namespaces never sent to the browser through the general preferences API. */
const BROWSER_HIDDEN_PREFERENCE_KEYS = ["texting_registration"] as const;

/** The preferences envelope as the browser may see it. */
export function browserPreferenceEnvelope(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const envelope = { ...(value as Record<string, unknown>) };
  for (const key of BROWSER_HIDDEN_PREFERENCE_KEYS) delete envelope[key];
  return envelope;
}
