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
    expect(output.result).toContain("create a real follow-up task");
  });

  it("blocks undurable future human promises across legacy failure wording", () => {
    for (const result of [
      "I wasn't able to update the lead status right now. I'll note it for the team.",
      "Let me take your info and have someone get back to you.",
      "Someone from our team will follow up.",
      "We'll follow up as soon as possible.",
    ]) {
      const output = enforceAgentToolResultTruth("update_lead_status", {
        toolCallId: "tool-1",
        result,
      });
      expect(output.result).toContain("lead status update was not confirmed");
      expect(output.result).toContain("create a real follow-up task");
    }
  });
});
