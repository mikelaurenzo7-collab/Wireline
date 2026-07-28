import { describe, expect, it } from "vitest";
import {
  finalizeVapiToolBatch,
  truncateVapiToolResult,
  VAPI_TOOL_UNAVAILABLE_RESULT,
} from "../src/lib/vapi-tool-results";

describe("Vapi live tool results", () => {
  it("collapses multiline results into a single speakable line", () => {
    expect(truncateVapiToolResult("Found records:\nAlice\nBob\tReady")).toBe(
      "Found records: Alice Bob Ready",
    );
  });

  it("removes machine-only data suffixes before returning context to the model", () => {
    expect(truncateVapiToolResult('Appointment booked. [data: {"eventId":"secret"}]')).toBe(
      "Appointment booked.",
    );
  });

  it("returns exactly one parse-safe result for every requested tool call", () => {
    expect(
      finalizeVapiToolBatch(
        [{ id: "one" }, { id: "two" }],
        [{ toolCallId: "one", result: "Line one\nLine two" }],
      ),
    ).toEqual([
      { toolCallId: "one", result: "Line one Line two" },
      { toolCallId: "two", result: VAPI_TOOL_UNAVAILABLE_RESULT },
    ]);
  });
});
