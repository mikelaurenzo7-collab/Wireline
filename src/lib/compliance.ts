/**
 * src/lib/compliance.ts
 *
 * Compliance helpers for DNC (Do Not Call) lists and normalization.
 */

import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { isDncFailsafeBlocked } from "./dnc-failsafe";

// Normalize a phone number to digits only. This is the canonical form new DNC
// rows are written in; keep it the single normalizer for every write site.
export function normalizeDncPhone(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/**
 * Every stored form a DNC row for `raw` could take, so a read matches
 * regardless of how the row was written. This is deliberately tolerant because
 * historical rows are inconsistent: SMS "STOP" rows were saved "+"-prefixed
 * (sanitizePhone), while manual/agent adds saved digits-only (normalizeDncPhone),
 * and US numbers appear as both 10- and 11-digit. Matching all variants only
 * ever blocks MORE (the safe direction for TCPA/DNC) and never blocks a number
 * that isn't the same line.
 */
export function dncPhoneCandidates(raw: string): string[] {
  const digits = normalizeDncPhone(raw);
  if (digits.length < 7) return [];
  const forms = new Set<string>();
  const add = (value: string) => {
    if (value.length < 7) return;
    forms.add(value);
    forms.add(`+${value}`);
  };
  add(digits);
  if (digits.length === 11 && digits.startsWith("1")) add(digits.slice(1)); // 11 -> 10
  if (digits.length === 10) add(`1${digits}`); // 10 -> 11
  return [...forms];
}

/**
 * Check whether a phone number is on the DNC list for a given user.
 * Returns true if the call should be blocked. Matches every stored variant so
 * an SMS "STOP" opt-out (saved "+"-prefixed) still suppresses outbound calls.
 *
 * The Redis failsafe covers the narrow disaster window where Twilio has accepted
 * a STOP but Postgres could not persist the corresponding voice-suppression row.
 * Production fails closed if that shared compliance ledger cannot be checked.
 */
export async function isDncBlocked(userId: string, phone: string): Promise<boolean> {
  const candidates = dncPhoneCandidates(phone);
  if (candidates.length === 0) return false;
  const [data] = await drizzle
    .select({ id: schema.dncList.id })
    .from(schema.dncList)
    .where(and(eq(schema.dncList.userId, userId), inArray(schema.dncList.phone, candidates)))
    .limit(1);
  if (data) return true;
  return isDncFailsafeBlocked(userId, phone);
}
