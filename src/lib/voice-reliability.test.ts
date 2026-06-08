/**
 * voice-reliability.test.ts — pure helpers + aggregator math.
 */
import { describe, expect, it } from "vitest";
import {
  isAbnormalHangup,
  isPipelineFailure,
  isToolCallFailureResult,
} from "./call-reliability-capture";

describe("call-reliability helpers", () => {
  it("classifies abnormal hangup reasons", () => {
    expect(isAbnormalHangup("customer-ended-call")).toBe(false);
    expect(isAbnormalHangup("assistant-ended-call")).toBe(false);
    expect(isAbnormalHangup("pipeline-error")).toBe(true);
    expect(isAbnormalHangup("silence-timeout")).toBe(true);
    expect(isAbnormalHangup("voicemail")).toBe(true);
  });

  it("detects pipeline failures only for known pipeline error codes", () => {
    expect(isPipelineFailure("llm")).toBe(true);
    expect(isPipelineFailure("customer-ended-call")).toBe(false);
    expect(isPipelineFailure(null)).toBe(false);
  });

  it("detects failed tool-call speakable results", () => {
    expect(isToolCallFailureResult("Something went wrong running that action.")).toBe(true);
    expect(isToolCallFailureResult("Transferring you now — please hold.")).toBe(false);
  });
});
