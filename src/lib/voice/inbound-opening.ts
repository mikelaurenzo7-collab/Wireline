import { detectAiDisclosure } from "../tcpa-consent";

/**
 * The first spoken line of every inbound call says the caller is talking to
 * an AI assistant, with the recording notice (when the owner records this
 * Bot's calls) woven into that same line. This covers the saved greeting,
 * the after-hours and take-message greetings, and the default greeting.
 *
 * The phrasing matches the declarative patterns in `detectAiDisclosure` and
 * `detectRecordingDisclosure`, so the compliance ledger can prove delivery
 * from the transcript.
 */
const IDENTITY_SENTENCE =
  /^(?:hi|hello|hey|welcome|thanks for calling|thank you for calling|good (?:morning|afternoon|evening)|you've reached|you have reached|this is)\b/i;

function firstSentence(text: string): { first: string; rest: string } {
  const match = text.match(/^(.+?[.!?])(\s+|$)/s);
  if (!match) return { first: text, rest: "" };
  return { first: match[1], rest: text.slice(match[0].length).trim() };
}

function clean(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function inboundDisclosureLine(input: {
  agentName: string;
  businessName?: string | null;
  recordingEnabled: boolean;
}): string {
  const business = clean(input.businessName);
  const agent = clean(input.agentName) || "this business";
  const forWhom = business && business !== agent ? `${agent} at ${business}` : agent;
  return input.recordingEnabled
    ? `Hi, you're speaking with an AI assistant for ${forWhom}, and this call may be recorded for quality and compliance.`
    : `Hi, you're speaking with an AI assistant for ${forWhom}.`;
}

export function composeInboundOpening(input: {
  greeting: string;
  agentName: string;
  businessName?: string | null;
  recordingEnabled: boolean;
  /** "resume" when this leg replaces one that failed mid-call. */
  leg?: "failover" | "resume";
}): string {
  const disclosure = inboundDisclosureLine(input);
  if (input.leg === "resume") {
    // The caller already heard the greeting on the leg that failed. Repeat
    // the disclosure first, then pick the conversation back up.
    return `${disclosure.replace(/^Hi, you're/, "You're still")} Sorry, we got cut off for a moment. What can I help you with?`;
  }
  const greeting = input.greeting.replace(/\s+/g, " ").trim();
  const { first, rest } = firstSentence(greeting);
  // A greeting that already opens with a declarative AI disclosure is kept
  // as written when there is no recording notice to add.
  if (!input.recordingEnabled && first && detectAiDisclosure(first).found) return greeting;
  const remainder = IDENTITY_SENTENCE.test(first) ? rest : greeting;
  return `${disclosure} ${remainder || "How can I help?"}`.trim();
}
