import { describe, expect, it } from "vitest";

import { formatCallbackNumberForSpeech } from "../src/lib/agent-runtime";
import {
  nativeCallPurposeFromMetadata,
  nativeOutboundAmdParams,
  resolveNativeAmdBridgeAction,
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
  it("uses Enable and a short timeout for marketing so the SIP agent never greets a mailbox", () => {
    expect(nativeOutboundAmdParams("marketing_or_sales")).toEqual({
      machineDetection: "Enable",
      machineDetectionTimeout: 8,
    });
  });

  it("waits for greeting end on service and callback calls so identity voicemail can land", () => {
    expect(nativeOutboundAmdParams("service_or_requested").machineDetection).toBe(
      "DetectMessageEnd",
    );
    expect(nativeOutboundAmdParams("callback").machineDetection).toBe("DetectMessageEnd");
  });

  it("drops marketing machines, fax, and unknown; leaves service voicemail; fail-opens service unknown", () => {
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

  it("treats missing stored purpose as marketing so AMD cannot leave a service voicemail", () => {
    expect(nativeCallPurposeFromMetadata(undefined)).toBe("marketing_or_sales");
    expect(nativeCallPurposeFromMetadata("marketing_or_sales")).toBe("marketing_or_sales");
    expect(nativeCallPurposeFromMetadata("callback")).toBe("callback");
  });
});

describe("campaign attempt budget", () => {
  it("retries unreachable dials until the campaign max, then retires the lead", () => {
    expect(resolveRetryableLeadStatus(1, 3)).toBe("Retrying");
    expect(resolveRetryableLeadStatus(2, 3)).toBe("Retrying");
    expect(resolveRetryableLeadStatus(3, 3)).toBe("Max-Attempts");
    expect(resolveRetryableLeadStatus(0, 3)).toBe("Retrying");
    expect(resolveRetryableLeadStatus(1, 1)).toBe("Max-Attempts");
  });
});
