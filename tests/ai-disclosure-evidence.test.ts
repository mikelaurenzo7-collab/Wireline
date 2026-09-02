import { describe, expect, it } from "vitest";

import {
  classifyAiDisclosureEvidence,
  firstAgentTranscript,
} from "../src/lib/voice/ai-disclosure-evidence";

describe("OpenAI SIP AI-disclosure evidence", () => {
  it("never treats planned copy or buffer drain alone as delivery evidence", () => {
    expect(
      classifyAiDisclosureEvidence({
        actualOpeningTranscript: "",
        openingPlaybackConfirmed: true,
      }),
    ).toEqual({ event: "ai_disclosure_unverifiable", delivery: "unverifiable" });
  });

  it("records a drained opening without the disclosure as not detected", () => {
    expect(
      classifyAiDisclosureEvidence({
        actualOpeningTranscript: "Hi, this is Casey from BotBound calling about your request.",
        openingPlaybackConfirmed: true,
      }),
    ).toEqual({ event: "ai_disclosure_not_detected", delivery: "not_detected" });
  });

  it("verifies only disclosure text present in the actual provider transcript", () => {
    const result = classifyAiDisclosureEvidence({
      actualOpeningTranscript:
        "Hi, this is Casey from BotBound. This call uses an automated AI assistant.",
      openingPlaybackConfirmed: true,
    });
    expect(result.event).toBe("ai_disclosure_played");
    expect(result.delivery).toBe("verified");
    expect(result.evidence).toMatch(/automated AI assistant/i);
  });

  it("recovers the first actual Agent turn from a durable call transcript", () => {
    expect(
      firstAgentTranscript("Caller: Hello\nAgent: This call uses an automated AI assistant.\n"),
    ).toBe("This call uses an automated AI assistant.");
  });
});
