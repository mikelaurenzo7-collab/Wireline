import { describe, expect, it } from "vitest";
import { isToolCallFailureResult } from "../src/lib/call-reliability-capture";

describe("live tool reliability classification", () => {
  it("counts honest failures and uncertain completion as failed tool calls", () => {
    for (const result of [
      "The email was not confirmed. Do not say it was sent.",
      "That action is taking longer than expected and may still be processing.",
      "The action did not complete successfully.",
      "I couldn't safely verify whether that action was already processed.",
      "The callback was not scheduled because the requested time could not be verified.",
      "That action was already started and may still be processing.",
      "I couldn't record or send the escalation right now.",
    ]) {
      expect(isToolCallFailureResult(result)).toBe(true);
    }
  });

  it("does not mark explicit completed outcomes as failures", () => {
    for (const result of [
      "Email sent.",
      "Callback scheduled for Tuesday at 2 PM Central.",
      "I recorded this escalation for the team.",
      "Support ticket #abc123 created.",
    ]) {
      expect(isToolCallFailureResult(result)).toBe(false);
    }
  });
});
