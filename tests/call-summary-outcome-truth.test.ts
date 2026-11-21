import { describe, expect, it } from "vitest";

import {
  callOutcomeLabel,
  classifyCallOutcome as classifyDisplayedOutcome,
} from "../src/lib/call-outcome";
import { callerTurnsText, classifyCallOutcome } from "../src/lib/post-call-digest";
import { deterministicSummary } from "../src/lib/voice/openai-sip-session";

const GREETING =
  "Agent: This call uses an automated AI assistant on behalf of Acme Plumbing. " +
  "Hi, thanks for calling! I can schedule an appointment or answer questions.";

describe("call summary and outcome truth", () => {
  it("summarizes what the caller said, never the Bot's disclosure and greeting", () => {
    const transcript = [
      GREETING,
      "Caller: My kitchen sink won't stop leaking.",
      "Agent: I'm sorry to hear that. What's the best number to reach you?",
      "Caller: 512 555 0100, after 5pm please.",
    ].join("\n");
    expect(deterministicSummary(transcript)).toBe(
      "Caller: My kitchen sink won't stop leaking. / 512 555 0100, after 5pm please.",
    );
    expect(deterministicSummary(GREETING)).toBe(
      "The caller did not say anything the Bot could transcribe.",
    );
    expect(deterministicSummary("")).toBe("No transcript is available for this call.");
    expect(callerTurnsText(transcript)).not.toContain("appointment");
  });

  it("tags a live call booked only when the Bot actually booked it", () => {
    const transcript = `${GREETING}\nCaller: Do you have anything Saturday?`;
    const live = (appointmentBooked: boolean) =>
      classifyCallOutcome({
        summary: deterministicSummary(transcript),
        durationSeconds: 95,
        endedReason: "completed",
        observed: { callerText: callerTurnsText(transcript), appointmentBooked },
      });
    expect(live(false)).not.toBe("booked");
    expect(live(true)).toBe("booked");
  });

  it("keeps a Calendar receipt when native transcript or timing is incomplete", () => {
    for (const [durationSeconds, callerText] of [
      [null, "Tuesday works."],
      [90, ""],
      [5, "Yes."],
    ] as const) {
      expect(
        classifyCallOutcome({
          durationSeconds,
          observed: { callerText, appointmentBooked: true },
        }),
      ).toBe("booked");
    }
    expect(
      classifyCallOutcome({
        durationSeconds: null,
        observed: { callerText: "What are your hours?", appointmentBooked: false },
      }),
    ).toBe("info");
    expect(
      classifyCallOutcome({
        durationSeconds: null,
        observed: { callerText: "Please stop calling me.", appointmentBooked: true },
      }),
    ).toBe("dnc");
  });

  it("shows indirect caller questions as information requests in Call History", () => {
    const transcript = [
      GREETING,
      "Caller: Can you tell me what BotBound does for a carpeting business?",
      "Agent: I can take calls and collect flooring estimate requests.",
    ].join("\n");
    const classify = (callerText: string, appointmentBooked = false) =>
      classifyCallOutcome({ durationSeconds: 37, observed: { callerText, appointmentBooked } });
    const outcomeTag = classify(callerTurnsText(transcript));

    expect(callOutcomeLabel(classifyDisplayedOutcome({ outcomeTag }))).toBe("Info request");
    expect(classify("Could you please tell me how the service works?")).toBe("info");
    expect(classify("Tell me when your office opens.")).toBe("info");
    expect(classify("Can you tell me what BotBound does? Please call me back.")).toBe("followup");
    expect(classify("Can you tell me what BotBound does?", true)).toBe("booked");
    expect(classify("Can you tell me what BotBound does? Please stop calling me.", true)).toBe(
      "dnc",
    );
    expect(classify("Can you tell me a joke?")).toBe("other");
  });

  it("uses explicit revocation language for opt-outs, not ordinary words", () => {
    const outcome = (callerText: string) =>
      classifyCallOutcome({
        durationSeconds: 60,
        endedReason: "completed",
        observed: { callerText, appointmentBooked: false },
      });
    expect(outcome("My sink won't stop leaking and I'm busy until 5.")).not.toBe("dnc");
    expect(outcome("My sink won't stop leaking and I'm busy until 5.")).not.toBe("unreachable");
    expect(outcome("Please stop calling me.")).toBe("dnc");
    expect(outcome("Sorry, wrong number.")).toBe("unreachable");
    expect(outcome("I'm not interested, thanks.")).toBe("other");
    expect(outcome("")).toBe("unreachable");
  });
});
