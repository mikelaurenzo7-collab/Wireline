import { describe, expect, it } from "vitest";

import {
  callOutcomeDetailFor,
  callOutcomeLabel,
  callOutcomeLabelFor,
  classifyCallOutcome,
} from "../src/lib/call-outcome";

describe("call outcome wording follows the call's direction", () => {
  it("says an outbound attempt that never connected was not reached, not missed", () => {
    const outcome = classifyCallOutcome({
      outcomeTag: "unreachable",
      endedReason: "carrier-busy",
      durationSeconds: 0,
    });
    expect(outcome).toBe("missed");
    expect(callOutcomeLabelFor(outcome, "outbound")).toBe("Not reached");
    expect(callOutcomeDetailFor(outcome, "outbound")).toBe(
      "The call did not connect. Nobody was reached.",
    );
  });

  it("keeps Missed for an incoming call nobody answered", () => {
    expect(callOutcomeLabelFor("missed", "inbound")).toBe("Missed");
    expect(callOutcomeLabelFor("missed", null)).toBe("Missed");
    expect(callOutcomeDetailFor("missed", "inbound")).toBe("The call was missed.");
  });

  it("leaves every other outcome and the shared bucket label alone", () => {
    expect(callOutcomeLabelFor("booked", "outbound")).toBe("Booked");
    expect(callOutcomeLabelFor("email_pending", "outbound")).toBe("Email pending");
    // Reliability totals use the bucket label, which must stay one name.
    expect(callOutcomeLabel("missed")).toBe("Missed");
  });
});
