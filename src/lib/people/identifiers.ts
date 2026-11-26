import type { PersonIdentifierKind } from "../../db/people-schema";

/**
 * Identifier normalization for People. Phones become E.164 (North American
 * ten- and eleven-digit numbers gain +1; other countries must already carry
 * their + prefix). Emails are lowercased bare addresses; a "Name <address>"
 * header is reduced to its address. Anything ambiguous returns null rather
 * than a guess, because a wrong identifier joins the wrong person's history.
 */

export type NormalizedIdentifier = { kind: PersonIdentifierKind; value: string };

const EMAIL_PATTERN = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function normalizePersonPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Reject letters and anything else a dial string should not contain, so a
  // stray word never collapses into a number.
  if (!trimmed || !/^\+?[\d().\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  // A + prefix states the country code, so it is kept exactly: "+55 51..." is
  // Brazil, not a North American number that happens to have ten digits.
  if (trimmed.startsWith("+")) {
    const e164 = `+${digits}`;
    return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function normalizePersonEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 320) return null;
  let candidate = trimmed;
  if (trimmed.includes("<") || trimmed.includes(">")) {
    const named = /^([^<>\r\n]*)<([^<>]*)>$/.exec(trimmed);
    if (!named) return null;
    candidate = named[2].trim();
    // Mail clients often repeat the address as its own display name:
    // "a@x.com" <a@x.com>. That is one address written twice. Any other @ or ;
    // before the bracket is a list or a second address, which stays refused.
    const label = named[1]
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    if (/[@;\r\n]/.test(label) && label.toLowerCase() !== candidate.toLowerCase()) return null;
  }
  const lowered = candidate.toLowerCase();
  if (lowered.length > 254 || !EMAIL_PATTERN.test(lowered)) return null;
  return lowered;
}

/** The display name in a "Name <address>" header, when there is one. */
export function emailDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const named = /^\s*"?([^"<>\r\n@]{1,120}?)"?\s*<[^<>]+>\s*$/.exec(raw);
  const name = named?.[1]?.trim();
  return name ? name : null;
}

export function normalizeIdentifier(kind: unknown, raw: unknown): NormalizedIdentifier | null {
  if (kind === "phone") {
    const value = normalizePersonPhone(raw);
    return value ? { kind, value } : null;
  }
  if (kind === "email") {
    const value = normalizePersonEmail(raw);
    return value ? { kind, value } : null;
  }
  return null;
}

/**
 * Channel tables store phones as entered. These are the digit strings a
 * stored number may reduce to for one E.164 identifier: North American
 * numbers may have been saved without the leading 1; other countries match
 * exactly. Used with the existing last-ten-digit indexes.
 */
export function phoneDigitCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  if (!digits) return [];
  return digits.length === 11 && digits.startsWith("1") ? [digits, digits.slice(1)] : [digits];
}

export function phoneTail(e164: string): string {
  return e164.replace(/\D/g, "").slice(-10);
}
