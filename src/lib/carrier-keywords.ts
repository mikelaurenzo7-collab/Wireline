/**
 * Carrier SMS keyword matching (STOP / START / HELP families).
 *
 * Pure + dependency-free so the compliance behavior can be unit-tested without
 * importing the Twilio route (which pulls in server-context / DB side effects).
 *
 * Exact-matching the whole trimmed body missed real-world opt-outs like "STOP."
 * (trailing punctuation) and "STOP CALLING ME" (leading keyword + trailing
 * words), silently keeping a consumer subscribed — a TCPA/carrier violation.
 * We match the edge-punctuation-stripped message OR its leading word so those
 * register, while staying conservative (leading word only, never an embedded
 * mention) to avoid false positives like "don't stop the updates".
 */
export function matchesCarrierKeyword(
  trimmedLower: string,
  keywords: ReadonlySet<string>,
): boolean {
  const normalized = trimmedLower.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (keywords.has(normalized)) return true;
  const firstWord = normalized.split(/\s+/)[0] ?? "";
  return firstWord.length > 0 && keywords.has(firstWord);
}
