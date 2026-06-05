import { sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm/column";

/**
 * Match stored phone numbers by normalized 10-digit tail (US-style).
 * Uses equality on a stripped suffix — avoids leading-wildcard ILIKE scans.
 */
export function phoneTailEquals(column: AnyColumn, norm: string) {
  return sql`right(regexp_replace(${column}, '[^0-9]', '', 'g'), 10) = ${norm}`;
}
