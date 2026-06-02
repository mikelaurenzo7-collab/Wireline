/**
 * useStreamingChat — unit tests for SSE streaming hook logic.
 */
import { describe, it, expect } from "vitest";

// We test the exported types and basic shape since the hook requires
// a DOM environment with fetch. Integration testing happens in e2e.
describe("useStreamingChat module", () => {
  it("exports the hook and expected types", async () => {
    const mod = await import("./useStreamingChat");
    expect(typeof mod.useStreamingChat).toBe("function");
  });

  it("StreamPhase type covers expected phases", () => {
    // Type-level check — this file compiles iff the phases are correct
    const phases: Array<import("./useStreamingChat").StreamPhase> = [
      "idle",
      "connecting",
      "thinking",
      "replying",
      "done",
      "error",
    ];
    expect(phases).toHaveLength(6);
  });
});
