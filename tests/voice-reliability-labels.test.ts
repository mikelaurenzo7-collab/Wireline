import { describe, expect, it } from "vitest";
import {
  callEndingLabel,
  recentCallIssueLabel,
} from "../src/components/insights/voice-reliability-labels";

describe("voice reliability labels", () => {
  it("keeps an unconfirmed sideband close separate from a flagged phone hangup", () => {
    expect(callEndingLabel("provider-close-1006")).toBe("Connection ended without confirmation");
    expect(recentCallIssueLabel({ pipelineError: "connection", durationSeconds: 92 })).toBe(
      "Connection issue",
    );
  });

  it("calls a genuine pre-session failure a setup issue", () => {
    expect(callEndingLabel("pre-session-rejected")).toBe("Could not connect");
    expect(recentCallIssueLabel({ pipelineError: "startup", durationSeconds: 0 })).toBe(
      "Call setup issue",
    );
  });

  it("keeps later processing failures visible without calling them setup failures", () => {
    expect(recentCallIssueLabel({ pipelineError: "openai_response", durationSeconds: 29 })).toBe(
      "Call processing issue",
    );
    expect(recentCallIssueLabel({ pipelineError: null, durationSeconds: 29 })).toBeNull();
  });
});
