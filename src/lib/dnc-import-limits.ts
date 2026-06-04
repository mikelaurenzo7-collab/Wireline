/**
 * Client-safe DNC import limits — no server/db imports.
 * Shared by DncManager (browser) and compliance-routes (API).
 */

/** Max numbers per DNC POST (manual + CSV). Enforced client- and server-side. */
export const DNC_IMPORT_MAX_ENTRIES = 5000;

export function dncImportLimitError(count: number): string | null {
  if (count <= DNC_IMPORT_MAX_ENTRIES) return null;
  return `Maximum ${DNC_IMPORT_MAX_ENTRIES.toLocaleString()} numbers per import. Split large CSVs into smaller files.`;
}
