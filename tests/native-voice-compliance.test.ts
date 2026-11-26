import { describe, expect, it } from "vitest";

import { formatCallbackNumberForSpeech } from "../src/lib/agent-runtime";
import {
  nativeCallPurposeFromMetadata,
  nativeOutboundAmdParams,
  resolveNativeAmdBridgeAction,
  resolveNativeAsyncAmdAction,
} from "../src/lib/voice/native-outbound-amd";
import { resolveRetryableLeadStatus } from "../src/lib/outbound-status";

describe("formatCallbackNumberForSpeech", () => {
  it("groups NANP numbers into spoken digit chunks", () => {
    expect(formatCallbackNumberForSpeech("+13125550123")).toBe(
      "three one two, five five five, zero one two three",
    );
    expect(formatCallbackNumberForSpeech("15551234567")).toBe(
      "five five five, one two three, four five six seven",
    );
  });

  it("returns empty when no digits are present", () => {
    expect(formatCallbackNumberForSpeech(null)).toBe("");
    expect(formatCallbackNumberForSpeech("not-a-number")).toBe("");
  });
});

describe("native outbound AMD", () => {
  const amdUrl = "https://app.example/amd?token=t";

  it("detects synchronously with a short timeout for marketing so the Bot never greets a mailbox", () => {
    expect(nativeOutboundAmdParams("marketing_or_sales", amdUrl)).toEqual({
      machineDetection: "Enable",
      machineDetectionTimeout: 8,
    });
  });

  it("detects in the background on service calls so an answered person is not held in silence", () => {
    for (const purpose of ["service_or_requested", "callback", "personal"] as const) {
      expect(nativeOutboundAmdParams(purpose, amdUrl)).toEqual({
        machineDetection: "Enable",
        machineDetectionTimeout: 30,
        asyncAmd: "true",
        asyncAmdStatusCallback: amdUrl,
        asyncAmdStatusCallbackMethod: "POST",
      });
    }
  });

  it("ends a bridged service call on a machine or fax and keeps talking to a person", () => {
    expect(resolveNativeAsyncAmdAction("machine_start")).toBe("hangup");
    expect(resolveNativeAsyncAmdAction("machine_end_beep")).toBe("hangup");
    expect(resolveNativeAsyncAmdAction("fax")).toBe("hangup");
    expect(resolveNativeAsyncAmdAction("human")).toBe("continue");
    expect(resolveNativeAsyncAmdAction("unknown")).toBe("continue");
    expect(resolveNativeAsyncAmdAction("")).toBe("continue");
  });

  it("classifies service machines for the route's no-message drop and fail-opens service unknown", () => {
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "machine_start",
        callPurpose: "marketing_or_sales",
      }),
    ).toBe("drop");
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "machine_end_beep",
        callPurpose: "service_or_requested",
      }),
    ).toBe("voicemail");
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "fax",
        callPurpose: "callback",
      }),
    ).toBe("drop");
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "unknown",
        callPurpose: "marketing_or_sales",
      }),
    ).toBe("drop");
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "",
        callPurpose: "marketing_or_sales",
      }),
    ).toBe("drop");
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "unknown",
        callPurpose: "service_or_requested",
      }),
    ).toBe("bridge");
    expect(
      resolveNativeAmdBridgeAction({
        answeredBy: "human",
        callPurpose: "marketing_or_sales",
      }),
    ).toBe("bridge");
  });

  it("treats missing stored purpose as marketing so AMD cannot select service behavior", () => {
    expect(nativeCallPurposeFromMetadata(undefined)).toBe("marketing_or_sales");
    expect(nativeCallPurposeFromMetadata("marketing_or_sales")).toBe("marketing_or_sales");
    expect(nativeCallPurposeFromMetadata("callback")).toBe("callback");
  });
});

describe("campaign attempt budget", () => {
  it("retries unreachable dials until the campaign max, then retires the lead", () => {
    expect(resolveRetryableLeadStatus(1, 3, "campaign")).toBe("Retrying");
    expect(resolveRetryableLeadStatus(2, 3, "campaign")).toBe("Retrying");
    expect(resolveRetryableLeadStatus(3, 3, "campaign")).toBe("Max-Attempts");
    expect(resolveRetryableLeadStatus(0, 3, "campaign")).toBe("Retrying");
    expect(resolveRetryableLeadStatus(1, 1, "campaign")).toBe("Max-Attempts");
  });

  it("never leaves a single call with no campaign waiting on a retry nobody makes", () => {
    expect(resolveRetryableLeadStatus(1, 3, null)).toBe("Failed");
    expect(resolveRetryableLeadStatus(1, 3, undefined)).toBe("Failed");
    expect(resolveRetryableLeadStatus(0, 3, "")).toBe("Failed");
  });
});
