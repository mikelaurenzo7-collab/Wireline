/**
 * useStreamingChat — unit tests for SSE streaming hook logic.
 */
import { describe, it, expect } from "vitest";
import { parseSseEvents } from "./useStreamingChat";

describe("useStreamingChat module", () => {
  it("exports the hook and expected types", async () => {
    const mod = await import("./useStreamingChat");
    expect(typeof mod.useStreamingChat).toBe("function");
  });

  it("StreamPhase type covers expected phases", () => {
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

  it("parseSseEvents handles trailing buffer without newline", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    parseSseEvents(["event: done", 'data: {"reply":"ok"}'], (event, data) => {
      events.push({ event, data });
    });
    expect(events).toEqual([{ event: "done", data: { reply: "ok" } }]);
  });

  it("parseSseEvents handles CRLF-framed SSE blocks", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    parseSseEvents(["event: done\r", 'data: {"reply":"hello"}\r', "\r"], (event, data) => {
      events.push({ event, data });
    });
    expect(events).toEqual([{ event: "done", data: { reply: "hello" } }]);
  });

  it("parseSseEvents forwards Director activity milestones", () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    parseSseEvents(
      [
        "event: activity",
        '{"id":"context","label":"Loaded workspace context","status":"done"}'.replace(
          /^/,
          "data: ",
        ),
      ],
      (event, data) => {
        events.push({ event, data });
      },
    );
    expect(events).toEqual([
      {
        event: "activity",
        data: { id: "context", label: "Loaded workspace context", status: "done" },
      },
    ]);
  });
});
