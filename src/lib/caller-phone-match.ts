/** Compare complete phone numbers without equating different country codes. */
export function callerPhoneKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!/^\+?[\d().\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }
  // Unprefixed ten-digit numbers are North American national numbers.
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return null;
}

/** Stored North American numbers may omit +1; all other countries stay exact. */
export function callerPhoneDigitsCandidates(value: unknown): string[] {
  const key = callerPhoneKey(value);
  if (!key) return [];
  return key.length === 11 && key.startsWith("1") ? [key, key.slice(1)] : [key];
}
