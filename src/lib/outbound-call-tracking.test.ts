import { describe, expect, it } from "vitest";
import {
  isOutboundCallPlaceholder,
  OUTBOUND_CALL_DIALING_MARKER,
  OUTBOUND_CALL_PLACEHOLDER_SUMMARY,
} from "./outbound-call-tracking";
import { classifyCallOutcome } from "./post-call-digest";

describe("isOutboundCallPlaceholder", () => {
  it("detects dialing marker", () => {
    expect(isOutboundCallPlaceholder({ pipelineError: OUTBOUND_CALL_DIALING_MARKER })).toBe(true);
  });

  it("detects placeholder summary", () => {
    expect(isOutboundCallPlaceholder({ summary: OUTBOUND_CALL_PLACEHOLDER_SUMMARY })).toBe(true);
  });
});

describe("classifyCallOutcome endedReason", () => {
  it("marks silence-timed-out as unreachable", () => {
    expect(
      classifyCallOutcome({
        durationSeconds: 30,
        endedReason: "silence-timed-out",
      }),
    ).toBe("unreachable");
  });
});
