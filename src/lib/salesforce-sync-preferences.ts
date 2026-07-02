import { z } from "zod";

/**
 * Controls the existing post-call Salesforce Task delivery path. New fields
 * belong here only after their runtime behavior is implemented and reviewed.
 *
 * The default intentionally preserves historical behavior: Salesforce call
 * activities remain enabled for every connection created before this preference
 * existed.
 */
export const DEFAULT_SALESFORCE_SYNC_PREFERENCES = {
  callActivitySyncEnabled: true,
} as const;

export const SalesforceSyncPreferencesSchema = z
  .object({
    callActivitySyncEnabled: z.boolean(),
  })
  .strict();

export type SalesforceSyncPreferences = z.infer<typeof SalesforceSyncPreferencesSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Safely reads Wireline-owned metadata without trusting arbitrary JSON stored
 * beside an OAuth connection. Invalid or legacy metadata falls back to the
 * established enabled behavior.
 */
export function getSalesforceSyncPreferences(metadata: unknown): SalesforceSyncPreferences {
  if (
    !isRecord(metadata) ||
    !isRecord(metadata.wireline) ||
    !isRecord(metadata.wireline.salesforce)
  ) {
    return { ...DEFAULT_SALESFORCE_SYNC_PREFERENCES };
  }

  const parsed = SalesforceSyncPreferencesSchema.safeParse(metadata.wireline.salesforce);
  return parsed.success ? parsed.data : { ...DEFAULT_SALESFORCE_SYNC_PREFERENCES };
}

/**
 * Adds Wireline-owned Salesforce preferences without discarding provider or
 * future integration metadata on the same CRM connection row.
 */
export function mergeSalesforceSyncPreferences(
  metadata: unknown,
  preferences: SalesforceSyncPreferences,
): Record<string, unknown> {
  const base = isRecord(metadata) ? metadata : {};
  const wireline = isRecord(base.wireline) ? base.wireline : {};
  const salesforce = isRecord(wireline.salesforce) ? wireline.salesforce : {};

  return {
    ...base,
    wireline: {
      ...wireline,
      salesforce: {
        ...salesforce,
        ...preferences,
      },
    },
  };
}
