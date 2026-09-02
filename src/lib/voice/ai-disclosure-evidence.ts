import { detectAiDisclosure } from "../tcpa-consent";

export const AI_DISCLOSURE_EVENTS = [
  "ai_disclosure_played",
  "ai_disclosure_not_detected",
  "ai_disclosure_unverifiable",
] as const;

export type AiDisclosureEvidence = {
  event: (typeof AI_DISCLOSURE_EVENTS)[number];
  delivery: "verified" | "not_detected" | "unverifiable";
  evidence?: string;
};

/**
 * Classify only provider-transcribed opening audio. Planned prompt text is not
 * delivery evidence, and a drained buffer without a transcript is still
 * unverifiable rather than proof that a particular sentence was spoken.
 */
export function classifyAiDisclosureEvidence(input: {
  actualOpeningTranscript: string;
  openingPlaybackConfirmed: boolean;
}): AiDisclosureEvidence {
  const actualOpeningTranscript = input.actualOpeningTranscript.trim();
  if (!input.openingPlaybackConfirmed || !actualOpeningTranscript) {
    return { event: "ai_disclosure_unverifiable", delivery: "unverifiable" };
  }

  const disclosure = detectAiDisclosure(actualOpeningTranscript);
  if (!disclosure.found) {
    return { event: "ai_disclosure_not_detected", delivery: "not_detected" };
  }
  return {
    event: "ai_disclosure_played",
    delivery: "verified",
    evidence: disclosure.excerpt,
  };
}

/** Recover the first actual Agent turn from the durable compact transcript. */
export function firstAgentTranscript(transcript: string): string {
  const line = transcript
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith("Agent:"));
  return line ? line.slice("Agent:".length).trim() : "";
}
