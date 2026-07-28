import { describe, expect, it } from "vitest";
import {
  finalizeVapiToolBatch,
  truncateVapiToolResult,
  VAPI_TOOL_TIMEOUT_MS,
  VAPI_TOOL_UNAVAILABLE_RESULT,
} from "../src/lib/vapi-tool-results";

describe("Vapi live tool results", () => {
  it("preserves meaningful result structure for the next reasoning turn", () => {
    expect(truncateVapiToolResult("Found records:\nAlice\nBob\tReady")).toBe(
      "Found records:\nAlice\nBob\tReady",
    );
  });

  it("removes machine-only data suffixes before returning context to the model", () => {
    expect(truncateVapiToolResult('Appointment booked. [data: {"eventId":"secret"}]')).toBe(
      "Appointment booked.",
    );
  });

  it("returns exactly one bounded result for every requested tool call", () => {
    expect(
      finalizeVapiToolBatch(
        [{ id: "one" }, { id: "two" }],
        [{ toolCallId: "one", result: "Line one\nLine two" }],
      ),
    ).toEqual([
      { toolCallId: "one", result: "Line one\nLine two" },
      { toolCallId: "two", result: VAPI_TOOL_UNAVAILABLE_RESULT },
    ]);
  });

  it("allows slow connected tools a bounded response window", () => {
    expect(VAPI_TOOL_TIMEOUT_MS).toBe(8_000);
  });
});
