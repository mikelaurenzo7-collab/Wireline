/**
 * PII redaction for text that flows into a publicly-shareable artifact.
 *
 * Recap artifacts are gated by an unguessable signed URL, not by strict
 * access control — the link can be forwarded, cc'd, or land in a shared
 * inbox. A caller reading a card number or SSN aloud during a call must
 * never have that number survive verbatim into the transcript, summary,
 * or extracted moments stored on the artifact. This is deliberately
 * narrow: pattern-match the two well-defined, high-risk "read aloud"
 * categories (payment card numbers, SSNs) rather than attempt general
 * PII detection, which needs NLP/ML and is out of scope here. Applied
 * at publish time so the raw digits never reach storage, not only at
 * render time.
 */

// SSN: strict 3-2-4 with required hyphens, or a bare 9-digit run that is
// not part of a longer digit sequence (word-boundary guarded so it
// doesn't clip into a longer number).
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b(?!\d)/g;

// Payment card numbers: 13-19 digits, optionally grouped with spaces or
// hyphens (the common 4-4-4-4 style or irregular groupings). Always
// starts and ends on a digit — a trailing separator before the next word
// (e.g. "...4242 please") must not be swallowed into the match. The
// quantifier enforces the 13-19 digit floor/ceiling; the 13-digit floor
// keeps this clear of 10/11-digit US phone numbers (with or without a
// leading country code) so a legitimate callback number in the
// transcript is never redacted.
const CARD_PATTERN = /\b\d(?:[ -]?\d){12,18}\b/g;

/**
 * Redact SSN- and payment-card-shaped digit runs. Idempotent and safe to
 * call on already-redacted text.
 */
export function redactSensitiveText(text: string): string {
  if (!text) return text;
  return text.replace(SSN_PATTERN, "[redacted]").replace(CARD_PATTERN, "[redacted]");
}

export function redactSensitiveLines<T extends { text: string }>(lines: readonly T[]): T[] {
  return lines.map((line) => ({ ...line, text: redactSensitiveText(line.text) }));
}
