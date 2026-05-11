/**
 * PII redaction utility.
 *
 * Intended as a configurable, deterministic pre-processor that runs
 * BEFORE we persist call transcripts, email bodies, lead context,
 * agent training payloads, or any other free-text customer content.
 *
 * Why regex (not Claude/Gemini) by default?
 *   • Deterministic — same input always produces the same redacted
 *     output; auditable; no model drift.
 *   • Fast and free — runs inline in the webhook hot path without
 *     touching Anthropic.
 *   • Conservative — catches the high-prevalence categories (emails,
 *     phones, SSNs, credit-card numbers, IPs) that account for the
 *     bulk of accidental PII spillage in transcripts.
 *
 * For higher-recall PII detection (named entities, addresses, custom
 * categories) operators can wire `claudeRedact()` from an LLM helper
 * on top of this — the regex pass strips the obvious stuff first so
 * the model only sees ambiguous cases.
 *
 * Categories supported out of the box:
 *   • email          — RFC-ish, deliberately permissive
 *   • phone          — NANP + E.164, 10–15 digits with separators
 *   • ssn            — US 9-digit social security numbers
 *   • credit_card    — 13–19 digit Luhn-validated PANs
 *   • ipv4           — dotted-quad
 *   • api_key        — common prefixes (sk_, sk-ant-, ghp_, AKIA, etc.)
 *
 * Usage:
 *   const { text, counts } = redactPII(transcript, { categories: ['email','phone','ssn'] });
 *   // counts === { email: 2, phone: 1, ssn: 0, ... }
 */

export type PIICategory =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "ipv4"
  | "api_key";

export interface RedactionOptions {
  /**
   * Which categories to redact. Defaults to ALL categories.
   * Pass an explicit list to opt-in only to specific categories.
   */
  categories?: PIICategory[];
  /**
   * Custom replacement formatter. Defaults to `[REDACTED:${cat}]`.
   * Receives the matched substring + the category for advanced use
   * cases (e.g. preserving last 4 digits of a phone for routing).
   */
  formatter?: (match: string, category: PIICategory) => string;
}

export interface RedactionResult {
  text: string;
  counts: Record<PIICategory, number>;
}

const DEFAULT_CATEGORIES: PIICategory[] = [
  "email",
  "phone",
  "ssn",
  "credit_card",
  "ipv4",
  "api_key",
];

// Order matters — credit_card must run BEFORE phone (long digit strings
// would otherwise be eaten by the phone matcher). API keys must run
// BEFORE everything else so the prefix doesn't get partial-matched.
const PATTERNS: Array<{ category: PIICategory; regex: RegExp; validator?: (m: string) => boolean }> = [
  {
    category: "api_key",
    // Common API-key shapes. Anchored by an unambiguous prefix so we
    // don't false-positive on hex strings inside transcripts.
    regex: /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk_(?:test|live)_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|wlk_[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  },
  {
    category: "email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    category: "credit_card",
    // 13-19 digits with optional separators. Luhn-validated to
    // suppress false positives on long account numbers.
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    validator: luhnValid,
  },
  {
    category: "ssn",
    // US SSN: NNN-NN-NNNN, with the most common invalid prefixes
    // (000, 666, 9xx) excluded to reduce false positives.
    regex: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
  },
  {
    category: "phone",
    // E.164 (+12025551234) or NANP-ish with separators.
    // Min 10 digits, max 15 (E.164 spec).
    regex: /\+?\d{1,3}[ .-]?\(?\d{2,4}\)?[ .-]?\d{2,4}[ .-]?\d{2,4}(?:[ .-]?\d{2,4})?/g,
    validator: (m: string) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15;
    },
  },
  {
    category: "ipv4",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
];

/**
 * Luhn (mod-10) check for credit card numbers. Rejects strings that
 * happen to be 13-19 digits but aren't valid PANs.
 */
export function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Redact PII from free-text content in-place using regex patterns.
 * Returns the redacted text plus a per-category count of replacements
 * made — useful for surfacing "we redacted 3 emails and 1 SSN from
 * this transcript" in the audit log.
 */
export function redactPII(input: string, opts: RedactionOptions = {}): RedactionResult {
  if (!input) return { text: input ?? "", counts: emptyCounts() };
  const enabled = new Set(opts.categories ?? DEFAULT_CATEGORIES);
  const fmt = opts.formatter ?? ((_m, c) => `[REDACTED:${c}]`);
  const counts = emptyCounts();

  let text = input;
  for (const pattern of PATTERNS) {
    if (!enabled.has(pattern.category)) continue;
    text = text.replace(pattern.regex, (match) => {
      if (pattern.validator && !pattern.validator(match)) return match;
      counts[pattern.category]++;
      return fmt(match, pattern.category);
    });
  }
  return { text, counts };
}

function emptyCounts(): Record<PIICategory, number> {
  return { email: 0, phone: 0, ssn: 0, credit_card: 0, ipv4: 0, api_key: 0 };
}

/**
 * True iff the text contains any PII the redactor would catch in any
 * of the given categories. Cheaper than a full redact + diff.
 */
export function hasPII(input: string, categories: PIICategory[] = DEFAULT_CATEGORIES): boolean {
  if (!input) return false;
  for (const pattern of PATTERNS) {
    if (!categories.includes(pattern.category)) continue;
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(input)) !== null) {
      if (!pattern.validator || pattern.validator(match[0])) return true;
    }
  }
  return false;
}
