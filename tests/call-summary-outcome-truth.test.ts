import { describe, expect, it } from "vitest";

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
    expect(deterministicSummary("")).toBe("No usable transcript was captured.");
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
