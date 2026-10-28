import { describe, expect, it } from "vitest";
import { readableCallSummary } from "../src/components/CallLogsClaude";

describe("call history summary", () => {
  it("does not describe a missed legacy call as completed", () => {
    expect(
      readableCallSummary("Native voice call completed without a usable transcript.", null),
    ).toBe("No usable transcript was captured.");
  });

  it("does not repeat a clipped transcript as a summary", () => {
    const transcript = `Agent: ${"Thanks for calling. ".repeat(10)}Caller: Can you help?`;
    const excerpt = `${transcript.slice(0, 150)}…`;
    expect(readableCallSummary(excerpt, transcript)).toBe(
      "A short summary isn't available for this call. Open Transcript below to review it.",
    );
  });

  it("keeps a real summary even when a transcript exists", () => {
    expect(
      readableCallSummary("The caller asked about pricing.", "Caller: What does it cost?"),
    ).toBe("The caller asked about pricing.");
  });
});
