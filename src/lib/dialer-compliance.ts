/**
 * src/lib/dialer-compliance.ts
 *
 * E.164 normalization helper for the Outbound Dialer. Consumed at the dial
 * site (src/lib/vapi-client.ts) and exercised by tests/dialer-compliance.test.ts.
 */

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
