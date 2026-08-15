/**
 * Carrier SMS keyword matching (STOP / START / HELP families).
 *
 * Pure + dependency-free so the compliance behavior can be unit-tested without
 * importing the Twilio route (which pulls in server-context / DB side effects).
 *
 * Two match modes, because over-matching is not symmetric:
 *
 * - `"leading-word"` (opt-out only). Exact-matching the whole trimmed body
 *   missed real-world opt-outs like "STOP." (trailing punctuation) and
 *   "STOP CALLING ME" (leading keyword + trailing words), silently keeping a
 *   consumer subscribed — a TCPA/carrier violation. Over-matching here fails
 *   safe: the consumer stops receiving messages.
 *
 * - `"exact"` (opt-in and HELP). The same generosity applied to START/YES/HELP
 *   fails UNSAFE in both directions. "Yes please, Tuesday works" registered as
 *   an opt-in: the consent ledger gained a consent-grant row the consumer never
 *   gave, the reply was answered with "You have been resubscribed" instead of
 *   reaching the agent, and — because the keyword branches return before the
 *   inbound-message store — the customer's actual words were dropped entirely.
 *   "Help me reschedule" and "Info on pricing" hit the same branch through
 *   HELP. Carrier rules require these keywords to be honored as standalone
 *   messages, which is exactly what this mode matches (still tolerating edge
 *   punctuation and case, so "START!" and "Help." register).
 */
export type CarrierKeywordMatchMode = "leading-word" | "exact";

export function matchesCarrierKeyword(
  trimmedLower: string,
  keywords: ReadonlySet<string>,
  mode: CarrierKeywordMatchMode = "leading-word",
): boolean {
  const normalized = trimmedLower.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (keywords.has(normalized)) return true;
  if (mode === "exact") return false;
  const firstWord = normalized.split(/\s+/)[0] ?? "";
  return firstWord.length > 0 && keywords.has(firstWord);
}
