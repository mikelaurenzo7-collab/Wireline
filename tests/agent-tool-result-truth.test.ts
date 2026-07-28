import { describe, expect, it } from "vitest";
import { enforceAgentToolResultTruth } from "../src/lib/agent-tool-result-truth";

describe("live tool result truthfulness", () => {
  it("preserves explicit provider-confirmed success", () => {
    expect(
      enforceAgentToolResultTruth("send_email", {
        toolCallId: "tool-1",
        result: "Email sent.",
      }),
    ).toEqual({ toolCallId: "tool-1", result: "Email sent." });
  });

  it("replaces unverified queue language with an honest failure", () => {
    const output = enforceAgentToolResultTruth("send_email", {
      toolCallId: "tool-1",
      result: "I've queued that email up for you. It should arrive shortly.",
    });
    expect(output.result).toContain("email was not confirmed");
    expect(output.result).toContain("Do not say it was sent, queued");
  });

  it("does not claim a follow-up task was noted when persistence failed", () => {
    const output = enforceAgentToolResultTruth("create_followup_task", {
      toolCallId: "tool-1",
      result: "I've noted that down. I'll make sure the team follows up with you.",
    });
    expect(output.result).toContain("follow-up task was not confirmed");
  });

  it("does not claim an unavailable lookup was durably noted", () => {
    const output = enforceAgentToolResultTruth("lookup_phone_number", {
      toolCallId: "tool-1",
      result: "I wasn't able to verify that number right now, but I've noted it down.",
    });
    expect(output.result).toContain("phone lookup was not confirmed");
    expect(output.result).toContain("offer a safe manual follow-up");
  });
});
