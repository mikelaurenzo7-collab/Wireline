/**
 * Carrier SMS keyword matching (STOP / START / HELP families).
 *
 * Pure + dependency-free so the compliance behavior can be unit-tested without
 * importing the Twilio route (which pulls in server-context / DB side effects).
 *
 * Two match modes, because over-matching is not symmetric:
 *
 * - `"leading-word"` (opt-out only). Honor standalone carrier words and
 *   unmistakable requests with extra words. A broad prefix match would turn
 *   "Cancel my appointment" or "Stop by Tuesday" into an unsubscribe and
 *   discard the customer's actual request before it reaches the Bot.
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
  // A prefix alone is not enough: CANCEL, END and STOP also start ordinary
  // service requests. All non-standalone variants need an explicit revocation.
  return isPlainLanguageOptOut(normalized);
}

/**
 * The consent words the application recognises: Twilio's registered keywords
 * plus the common spellings customers type ("opt out", "opt-in"). Both SMS
 * webhook routes read these sets; do not keep another copy.
 */
export const SMS_OPT_OUT_KEYWORDS: ReadonlySet<string> = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "revoke",
  "optout",
  "opt-out",
  "opt out",
]);
export const SMS_OPT_IN_KEYWORDS: ReadonlySet<string> = new Set([
  "start",
  "unstop",
  "yes",
  "optin",
  "opt-in",
  "opt in",
]);
export const SMS_HELP_KEYWORDS: ReadonlySet<string> = new Set(["help", "info", "support"]);

/**
 * Single-word keywords Twilio answers by itself on long codes, in its own words,
 * before the message reaches our webhook (https://help.twilio.com/articles/223134027).
 * STOP-type words also put the sender on Twilio's block list, so any text we
 * then send back fails with error 21610 (and logs a Twilio error for every
 * unsubscribe). START-type words get Twilio's own re-subscribe reply, so ours
 * would arrive as a second one. HELP and INFO are not forwarded at all unless
 * Advanced Opt-Out is on for the Messaging Service.
 */
const TWILIO_DEFAULT_KEYWORDS: ReadonlySet<string> = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "revoke",
  "optout",
  "quit",
  "start",
  "yes",
  "unstop",
  "help",
  "info",
]);

/**
 * True when the whole message is one of those keywords, so Twilio has already
 * replied and the application must not send a second confirmation. Twilio only
 * matches the entire body, so "STOP please" and "opt out" are ours to answer.
 */
export function twilioAnswersKeyword(body: string): boolean {
  return TWILIO_DEFAULT_KEYWORDS.has(
    String(body ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * Plain-language opt-outs. Since April 11, 2025 the FCC requires honoring a
 * revocation made by "any reasonable means", and its examples include texts
 * such as "stop texting me" or "leave me alone" that carry no keyword first.
 * These phrases are specific to messaging so ordinary replies ("stop by on
 * Tuesday", "please call me back") are untouched. Over-matching fails safe:
 * the person stops receiving texts and can reply START.
 */
const PLAIN_LANGUAGE_OPT_OUT: readonly RegExp[] = [
  /^(?:please\s+)?stop(?:\s+please)?$/,
  /^(?:please\s+|(?:can|could|would) you(?: please)?\s+)?(?:stop|quit|cease)\s+(?:texting|messaging|sending|contacting|calling|spamming)\s+(?:me|us|this number)(?:\s+(?:again|anymore|please|now|right now|immediately|from now on))?$/,
  /^(?:please\s+|can you\s+|could you\s+)?(?:stop|quit|cease)\s+(?:sending|receiving)\s+(?:me\s+)?(?:these|the|all|my|your)?\s*(?:texts?|text messages?|messages?|sms|notifications)?(?:\s+please)?$/,
  /^(?:please\s+)?(?:stop|cancel|end|quit)\s+(?:the|these|all|my|your)?\s*(?:texts?|text messages?|messages?|sms|notifications)(?:\s+please)?$/,
  /^(?:stop|cancel|end|quit)\s*[-,:]\s*no more\s+(?:texts?|messages?|sms)$/,
  /^(?:please\s+)?(?:don'?t|do not|never)\s+(?:text|message|contact|call)\s+(?:me|us|this number|my number)(?:\s+(?:again|anymore|please))?$/,
  /^(?:please\s+)?(?:don'?t|do not|never)\s+send\s+(?:me|us|this number|my number)\s+(?:any\s+more\s+)?(?:texts?|text messages?|messages?|sms)(?:\s+please)?$/,
  /^(?:i\s+)?(?:don'?t|do not)\s+want\s+to\s+receive\s+(?:any\s+more\s+)?(?:texts?|text messages?|messages?|sms|calls?)(?:\s+again)?$/,
  /^(?:please\s+)?(?:remove|delete|take)\s+(?:me|my number|this number)\s+(?:off|from)\s+(?:your|the)?\s*(?:text|messaging|contact)?\s*list(?:\s+please)?$/,
  /^(?:please\s+)?(?:remove|delete|take)\s+(?:me|my number|this number)\s+(?:off|from)(?:\s+your\s+list)?(?:\s+please)?$/,
  /^(?:please\s+)?(?:no\s+more|i\s+(?:don'?t|do not)\s+want\s+(?:any\s+)?more)\s+(?:texts?|text messages?|messages?|sms|calls?)(?:\s+please)?$/,
  /^(?:please\s+)?(?:i\s+want\s+to\s+)?(?:unsubscribe|opt\s*-?\s*out)(?:\s+me)?(?:\s+(?:from|of)\s+(?:(?:all|any|the|your|these|future)\s+)*(?:texts?|text messages?|messages?|sms))?(?:\s+please)?$/,
  /^(?:please\s+)?leave\s+me\s+alone(?:\s+please)?$/,
];

/** True for a plain-language opt-out request; callers check the carrier keywords first. */
export function isPlainLanguageOptOut(trimmedLower: string): boolean {
  const text = trimmedLower
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
  const matches = (candidate: string) =>
    PLAIN_LANGUAGE_OPT_OUT.some((pattern) => pattern.test(candidate));
  if (matches(text)) return true;

  // A polite sign-off does not change a complete revocation into a request.
  const withoutSignOff = text
    .replace(/(?:[,;]\s*|\s+)(?:please|(?:thanks|thank you)(?:\s+very much)?)$/, "")
    .trim();
  if (withoutSignOff !== text && matches(withoutSignOff)) return true;

  // Keep the anchored intent check, but also honor a complete opening
  // revocation followed by a separate statement or a different contact
  // channel. Do not treat an isolated "stop" fragment as a complete clause.
  const firstClause = text
    .match(/^([^.!?;,]+)(?:[.!;]\s+|,\s+(?=(?:please\s+)?(?:call|email)\s+me\b))/)?.[1]
    ?.trim();
  return Boolean(
    firstClause && !/^(?:please\s+)?stop(?:\s+please)?$/.test(firstClause) && matches(firstClause),
  );
}
