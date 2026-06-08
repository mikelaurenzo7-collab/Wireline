/**
 * useStreamingChat — unit tests for SSE streaming hook logic.
 */
import { describe, it, expect } from "vitest";
import {
  isDirectorBootstrapMeta,
  parseSseEvents,
  type SseParserState,
} from "./useStreamingChat";

describe("useStreamingChat module", () => {
  it("exports the hook and expected types", async () => {
    const mod = await import("./useStreamingChat");
    expect(typeof mod.useStreamingChat).toBe("function");
  });

  it("StreamPhase type covers expected phases", () => {
    const phases: Array<import("./useStreamingChat").StreamPhase> = [
      "idle",
      "connecting",
      "preparing",
      "thinking",
      "replying",
      "done",
      "error",
    ];
    expect(phases).toHaveLength(7);
  });

  it("parseSseEvents retains event state across calls until a blank-line boundary", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const state: SseParserState = { dataLines: [] };

    parseSseEvents(
      ["event: activity"],
      (event, data) => {
        events.push({ event, data });
      },
      state,
    );
    parseSseEvents(
      ['data: {"step":"reading"}', ""],
      (event, data) => {
        events.push({ event, data });
      },
      state,
    );

    expect(events).toEqual([{ event: "activity", data: { step: "reading" } }]);
  });

  it("parseSseEvents handles multi-line data payloads", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const state: SseParserState = { dataLines: [] };

    parseSseEvents(
      ["event: activity", "data: {", 'data:   "step": "reading"', "data: }", ""],
      (event, data) => {
        events.push({ event, data });
      },
      state,
    );

    expect(events).toEqual([{ event: "activity", data: { step: "reading" } }]);
  });

  it("parseSseEvents flushes trailing buffer without a final blank line", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const state: SseParserState = { dataLines: [] };

    parseSseEvents(
      ["event: done", 'data: {"reply":"ok"}'],
      (event, data) => {
        events.push({ event, data });
      },
      state,
      { flush: true },
    );

    expect(events).toEqual([{ event: "done", data: { reply: "ok" } }]);
  });

  it("isDirectorBootstrapMeta distinguishes early connect meta from routed meta", () => {
    expect(isDirectorBootstrapMeta({ status: "connecting" })).toBe(true);
    expect(isDirectorBootstrapMeta({ status: "connecting", model: "sonnet", deep: false })).toBe(
      false,
    );
  });

  it("parseSseEvents handles CRLF-framed SSE blocks", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    parseSseEvents(["event: done\r", 'data: {"reply":"hello"}\r', "\r"], (event, data) => {
      events.push({ event, data });
    });
    expect(events).toEqual([{ event: "done", data: { reply: "hello" } }]);
  });
});
