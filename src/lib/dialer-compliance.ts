/**
 * src/lib/dialer-compliance.ts
 *
 * Client-side compliance and E.164 normalization helpers for the Outbound Dialer.
 */

export interface DncEntry {
  id?: string;
  phone: string;
  phone_raw?: string | null;
  phoneRaw?: string | null;
  reason?: string | null;
  source?: string;
}

/**
 * Checks whether a customer phone number matches any of the active DNC list entries.
 * Normalizes input and entries to digits-only and handles US 10-to-11-digit prefixes.
 */
export function isNumberOnDncList(num: string, entries: DncEntry[]): boolean {
  if (!num || !entries || entries.length === 0) return false;
  const digits = num.replace(/\D/g, "");
  if (!digits) return false;

  return entries.some((entry) => {
    const rawVal = entry.phone_raw || entry.phoneRaw || entry.phone || "";
    const entryDigits = rawVal.replace(/\D/g, "");
    if (digits === entryDigits) return true;

    // 10 vs 11 digits North American fallback
    const d1 = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    const d2 =
      entryDigits.length === 11 && entryDigits.startsWith("1") ? entryDigits.slice(1) : entryDigits;
    return d1 === d2 && d1.length >= 10;
  });
}

/**
 * Clean and normalize raw phone input to a clean dialable format.
 * Automatically adds the '+1' prefix for 10-digit North American numbers.
 */
export function normalizeOutboundNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length < 7) return raw.trim();

  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  } else if (raw.trim().startsWith("+")) {
    return `+${digits}`;
  }
  return digits;
}
