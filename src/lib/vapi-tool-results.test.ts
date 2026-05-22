import { describe, it, expect, vi } from "vitest";
import {
  MAX_VAPI_PARALLEL_TOOL_CALLS,
  MAX_VAPI_TOOL_RESULT_CHARS,
  finalizeVapiToolBatch,
  runVapiToolCallsWithConcurrency,
  truncateVapiToolResult,
  VAPI_TOOL_UNAVAILABLE_RESULT,
  withVapiToolTimeout,
} from "./vapi-tool-results";

describe("truncateVapiToolResult", () => {
  it("strips trailing [data: JSON] blobs before length cap", () => {
    const raw = `Found 3 items. Summary here. [data: ${JSON.stringify({ id: 1, nested: { x: "y".repeat(200) } })}]`;
    const out = truncateVapiToolResult(raw);
    expect(out).not.toContain("[data:");
    expect(out).toContain("Found 3 items");
  });

  it("caps speakable text at MAX_VAPI_TOOL_RESULT_CHARS", () => {
    const long = "x".repeat(MAX_VAPI_TOOL_RESULT_CHARS + 500);
    const out = truncateVapiToolResult(long);
    expect(out.length).toBeLessThanOrEqual(MAX_VAPI_TOOL_RESULT_CHARS + 1);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("finalizeVapiToolBatch", () => {
  it("returns one truncated result per tool call id", () => {
    const toolCalls = [{ id: "a" }, { id: "b" }];
    const batch = [
      { toolCallId: "a", result: "ok " + "z".repeat(MAX_VAPI_TOOL_RESULT_CHARS + 10) },
      { toolCallId: "b", result: "fine" },
    ];
    const results = finalizeVapiToolBatch(toolCalls, batch);
    expect(results).toHaveLength(2);
    expect(results[0].toolCallId).toBe("a");
    expect(results[0].result.length).toBeLessThanOrEqual(MAX_VAPI_TOOL_RESULT_CHARS + 1);
    expect(results[1]).toEqual({ toolCallId: "b", result: "fine" });
  });

  it("fills missing ids with unavailable fallback", () => {
    const results = finalizeVapiToolBatch([{ id: "missing" }], []);
    expect(results[0]).toEqual({
      toolCallId: "missing",
      result: VAPI_TOOL_UNAVAILABLE_RESULT,
    });
  });
});

describe("runVapiToolCallsWithConcurrency", () => {
  it(`never runs more than ${MAX_VAPI_PARALLEL_TOOL_CALLS} handlers at once`, async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i) }));
    await runVapiToolCallsWithConcurrency(items, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 25));
      inFlight -= 1;
      return "done";
    });
    expect(peak).toBeLessThanOrEqual(MAX_VAPI_PARALLEL_TOOL_CALLS);
    expect(peak).toBeGreaterThan(1);
  });

  it("preserves result order", async () => {
    const items = [{ id: "0" }, { id: "1" }, { id: "2" }];
    const out = await runVapiToolCallsWithConcurrency(items, async (item) => item.id);
    expect(out).toEqual(["0", "1", "2"]);
  });
});

describe("withVapiToolTimeout", () => {
  it("rejects when work exceeds timeout", async () => {
    vi.useFakeTimers();
    const work = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 20_000);
    });
    const p = withVapiToolTimeout(work, 50);
    vi.advanceTimersByTime(60);
    await expect(p).rejects.toThrow("VAPI_TOOL_TIMEOUT");
    vi.useRealTimers();
  });
});
