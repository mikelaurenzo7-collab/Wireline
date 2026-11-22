/**
 * The first text to a recipient on a line identifies the sender and says how
 * to opt out. Carriers review traffic against the registered campaign samples,
 * which carry both. Later replies in an existing conversation stay as written.
 */

export const FIRST_CONTACT_OPT_OUT = "Reply STOP to opt out.";

/** Uppercase STOP is the carrier keyword. A lowercase "stop by" is not opt-out language. */
const OPT_OUT_LANGUAGE = /\bSTOP\b/;
const MAX_SENDER_NAME_LENGTH = 40;

export function firstContactSenderName(input: {
  brandName?: string | null;
  businessName?: string | null;
}): string | null {
  for (const candidate of [input.brandName, input.businessName]) {
    const name = String(candidate || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_SENDER_NAME_LENGTH)
      .trim();
    if (name) return name;
  }
  return null;
}

export function composeFirstContactSmsBody(input: {
  body: string;
  senderName?: string | null;
}): string {
  let text = input.body.trim();
  const name = String(input.senderName || "").trim();
  if (name && !text.toLowerCase().includes(name.toLowerCase())) {
    text = `${name}: ${text}`;
  }
  if (!OPT_OUT_LANGUAGE.test(text)) {
    text = `${text} ${FIRST_CONTACT_OPT_OUT}`;
  }
  return text;
}
