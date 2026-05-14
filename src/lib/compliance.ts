/**
 * src/lib/compliance.ts
 *
 * Compliance helpers for DNC (Do Not Call) lists and normalization.
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";

// Normalize a phone number to digits only for consistent matching.
export function normalizeDncPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Check whether a phone number is on the DNC list for a given user.
 * Returns true if the call should be blocked.
 */
export async function isDncBlocked(userId: string, phone: string): Promise<boolean> {
  const normalized = normalizeDncPhone(phone);
  if (!normalized) return false;
  const [data] = await drizzle
    .select({ id: schema.dncList.id })
    .from(schema.dncList)
    .where(and(
      eq(schema.dncList.userId, userId),
      eq(schema.dncList.phone, normalized)
    ))
    .limit(1);
  return !!data;
}
