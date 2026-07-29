import { describe, expect, it } from "vitest";
import {
  resolveVapiCallCostUsd,
  resolveVapiCallDurationSeconds,
  resolveVapiRecordingUrl,
  resolveVapiTranscript,
} from "./vapi-report-normalization";

describe("Vapi end-of-call report normalization", () => {
  it("prefers current top-level report telemetry", () => {
    const message = {
      cost: 0.42,
      startedAt: "2026-07-29T10:00:00.000Z",
      endedAt: "2026-07-29T10:02:03.900Z",
      transcript: "Direct transcript",
      recordingUrl: "https://recordings.example/direct",
      call: {
        cost: 9,
        startedAt: "2026-07-29T09:00:00.000Z",
        endedAt: "2026-07-29T09:10:00.000Z",
      },
    };

    expect(resolveVapiCallCostUsd(message)).toBe(0.42);
    expect(resolveVapiCallDurationSeconds(message)).toBe(123);
    expect(resolveVapiTranscript(message)).toBe("Direct transcript");
    expect(resolveVapiRecordingUrl(message)).toBe("https://recordings.example/direct");
  });

  it("falls back to artifact and call-object telemetry", () => {
    const call = {
      startedAt: "2026-07-29T10:00:00.000Z",
      endedAt: "2026-07-29T10:00:45.800Z",
      costs: [{ cost: 0.05 }, { cost: 0.12 }, { cost: "0.03" }],
    };
    const message = {
      call,
      artifact: {
        transcript: "Artifact transcript",
        recording: { url: "https://recordings.example/artifact" },
      },
    };

    expect(resolveVapiCallCostUsd(message, call)).toBeCloseTo(0.2, 8);
    expect(resolveVapiCallDurationSeconds(message, call)).toBe(45);
    expect(resolveVapiTranscript(message)).toBe("Artifact transcript");
    expect(resolveVapiRecordingUrl(message)).toBe("https://recordings.example/artifact");
  });

  it("preserves a genuine zero cost and explicit duration", () => {
    const message = {
      cost: 0,
      durationSeconds: 19.9,
      call: { cost: 2 },
    };

    expect(resolveVapiCallCostUsd(message)).toBe(0);
    expect(resolveVapiCallDurationSeconds(message)).toBe(19);
  });

  it("does not undercount an incomplete cost breakdown", () => {
    expect(resolveVapiCallCostUsd({ costs: [{ cost: 0.1 }, { type: "model" }] })).toBeNull();
    expect(resolveVapiCallCostUsd({ cost: "not-a-number" })).toBeNull();
  });

  it("returns honest empty values for absent or invalid telemetry", () => {
    const message = {
      startedAt: "invalid",
      endedAt: "also-invalid",
      transcript: "   ",
      artifact: { recording: "" },
    };

    expect(resolveVapiCallCostUsd(message)).toBeNull();
    expect(resolveVapiCallDurationSeconds(message)).toBe(0);
    expect(resolveVapiTranscript(message)).toBe("");
    expect(resolveVapiRecordingUrl(message)).toBeNull();
  });

  it("supports a string artifact recording reference", () => {
    expect(
      resolveVapiRecordingUrl({
        artifact: { recording: "https://recordings.example/private" },
      }),
    ).toBe("https://recordings.example/private");
  });
});
