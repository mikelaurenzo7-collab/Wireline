/**
 * useStreamingChat — unit tests for SSE streaming hook logic.
 */
import { describe, it, expect } from "vitest";
import {
  applyStreamingActivityEvent,
  markActiveStreamingActivitiesDone,
  parseSseEvents,
  type StreamingActivity,
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

  it("marks active activities done after a final done event while preserving warnings", () => {
    const before: StreamingActivity[] = [
      { id: "route", status: "done" },
      { id: "model", status: "active" },
      { id: "compose", status: "active" },
      { id: "save", status: "warning", detail: "Retrying persistence" },
      { id: "later", status: "pending" },
    ];

    expect(markActiveStreamingActivitiesDone(before)).toEqual([
      { id: "route", status: "done" },
      { id: "model", status: "done" },
      { id: "compose", status: "done" },
      { id: "save", status: "warning", detail: "Retrying persistence" },
      { id: "later", status: "pending" },
    ]);
  });

  it("applies activity SSE updates before the done-event fallback completes active work", () => {
    let activities: StreamingActivity[] = [
      { id: "route", status: "active", label: "Route" },
      { id: "model", status: "active", label: "Model" },
    ];

    parseSseEvents(
      [
        "event: activity",
        'data: {"id":"route","status":"done"}',
        "",
        "event: done",
        'data: {"reply":"ok"}',
      ],
      (event, data) => {
        if (event === "activity") {
          activities = applyStreamingActivityEvent(activities, data);
        }
        if (event === "done") {
          activities = markActiveStreamingActivitiesDone(activities);
        }
      },
    );

    expect(activities).toEqual([
      { id: "route", status: "done", label: "Route" },
      { id: "model", status: "done", label: "Model" },
    ]);
  });
});
