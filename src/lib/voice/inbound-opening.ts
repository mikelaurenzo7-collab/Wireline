import { detectAiDisclosure } from "../tcpa-consent";
import { OUTBOUND_RECORDING_NOTICE, agentNameAddsToBusiness } from "./outbound-opening";

/**
 * The first spoken line of a call the Bot answers.
 *
 * By default it is a short introduction: the Bot's name, that it is an AI
 * assistant, and the business, said once and in passing. The owner's saved
 * greeting follows it, with a hello-style first sentence folded into that
 * introduction. This covers the saved greeting, the after-hours and
 * take-message greetings, and the default greeting.
 *
 * An owner can instead have the Bot open with their greeting exactly as
 * written. Either way the recording notice is spoken when, and only when,
 * this Bot's calls are recorded.
 *
 * The introduction matches the declarative patterns in `detectAiDisclosure`,
 * and the notice those in `detectRecordingDisclosure`.
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

/** "Hi, I'm Sam, an AI assistant with Ridge Dental.", then the recording notice when calls are recorded. */
export function inboundDisclosureLine(input: {
  agentName: string;
  businessName?: string | null;
  recordingEnabled: boolean;
}): string {
  const business = clean(input.businessName);
  const agent = clean(input.agentName);
  const withBusiness = business ? ` with ${business}` : "";
  const introduction = agentNameAddsToBusiness(agent, business)
    ? `Hi, I'm ${agent}, an AI assistant${withBusiness}.`
    : `Hi, I'm an AI assistant${withBusiness}.`;
  return input.recordingEnabled ? `${introduction} ${OUTBOUND_RECORDING_NOTICE}` : introduction;
}

/**
 * Holds on every call, however the owner chose to greet: asked directly, the
 * Bot says what it is.
 */
export const AI_HONESTY_RULE =
  "IF ASKED WHAT YOU ARE: When someone asks whether they are speaking with a person, a recording or an AI, say plainly that you are an AI assistant. Never say or imply that you are a person. Do not bring it up otherwise.";

/**
 * What a Bot says in its owner's own words when they have not written a
 * greeting: its name, the business it works for, and an offer to help.
 */
export function defaultOwnGreeting(input: {
  agentName: string;
  businessName?: string | null;
}): string {
  const business = clean(input.businessName);
  const agent = clean(input.agentName);
  const introduction = agentNameAddsToBusiness(agent, business)
    ? `Hey, I'm ${agent}${business ? ` with ${business}` : ""}.`
    : `Hey, thanks for calling${business ? ` ${business}` : ""}.`;
  return `${introduction} How can I help you?`;
}

/** The greeting every Bot is created with, which no owner chose. */
function isGeneratedGreeting(greeting: string, agentName: string): boolean {
  return (
    greeting.toLowerCase() ===
    `hi, this is ${(agentName || "your Bot").toLowerCase()}. how can i help?`
  );
}

export function composeInboundOpening(input: {
  greeting: string;
  agentName: string;
  businessName?: string | null;
  recordingEnabled: boolean;
  /** "resume" when this leg replaces one that failed mid-call. */
  leg?: "failover" | "resume";
  /** The owner chose to open with their greeting exactly as written. */
  ownWords?: boolean;
}): string {
  // Spoken first wherever the Bot's own words follow, so it is never said over
  // a caller's answer and never lands inside a sentence the owner wrote. It is
  // added even when the greeting mentions recording: saying it twice is
  // harmless, and leaving it out is not.
  const recorded = input.recordingEnabled ? `${OUTBOUND_RECORDING_NOTICE} ` : "";
  if (input.leg === "resume") {
    // The caller already heard the greeting on the leg that failed, so it is
    // not repeated, and neither is the introduction.
    return `${recorded}Sorry, we got cut off for a moment. What can I help you with?`;
  }
  const written = input.greeting.replace(/\s+/g, " ").trim();
  if (input.ownWords) {
    const own =
      written && !isGeneratedGreeting(written, clean(input.agentName))
        ? written
        : defaultOwnGreeting(input);
    return `${recorded}${own}`;
  }
  const { first, rest } = firstSentence(written);
  // A greeting that already opens by saying it is an AI assistant is kept as written.
  if (first && detectAiDisclosure(first).found) return `${recorded}${written}`;
  const remainder = IDENTITY_SENTENCE.test(first) ? rest : written;
  return `${inboundDisclosureLine(input)} ${remainder || "How can I help you?"}`.trim();
}
