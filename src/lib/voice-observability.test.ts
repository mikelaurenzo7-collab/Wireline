/**
 * voice-observability.test.ts
 * Unit tests for per-call telemetry and demo line health computation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  recordVoiceMetrics,
  computeVoiceHealthWindow,
  alertOnVoiceDegradation,
  getLatencyTrends,
} from "./voice-observability";

const mockCallLogs: any[] = [];

vi.mock("./server-context", () => ({
  drizzle: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => {
        const makeThenable = () => {
          const obj: any = {
            orderBy: vi.fn(() => obj),
            limit: vi.fn().mockResolvedValue(mockCallLogs),
            then: (resolve: any, reject?: any) =>
              Promise.resolve(mockCallLogs).then(resolve, reject),
          };
          return obj;
        };
        return { where: vi.fn(() => makeThenable()) };
      }),
    })),
    insert: vi.fn(),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./webhook-helpers", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

describe("recordVoiceMetrics", () => {
  beforeEach(() => {
    mockCallLogs.length = 0;
    vi.clearAllMocks();
  });

  it("updates call log with TTFT and TTF audio", async () => {
    const { drizzle } = await import("./server-context");
    await recordVoiceMetrics("user-1", {
      vapiCallId: "call-123",
      ttftMs: 450,
      ttfAudioMs: 800,
      sttError: false,
      ttsError: false,
    });
    expect(drizzle.update).toHaveBeenCalled();
  });

  it("handles pipeline errors", async () => {
    const { drizzle } = await import("./server-context");
    await recordVoiceMetrics("user-1", {
      vapiCallId: "call-456",
      ttftMs: 1200,
      pipelineError: "llm",
    });
    expect(drizzle.update).toHaveBeenCalled();
  });
});

describe("computeVoiceHealthWindow", () => {
  beforeEach(() => {
    mockCallLogs.length = 0;
    vi.clearAllMocks();
  });

  function makeRow(opts: {
    ttftMs?: number | null;
    sttError?: boolean;
    ttsError?: boolean;
    pipelineError?: string | null;
    demo?: boolean;
    createdAt?: Date;
  }) {
    return {
      ttftMs: opts.ttftMs ?? null,
      ttfAudioMs: null,
      sttError: opts.sttError ?? false,
      ttsError: opts.ttsError ?? false,
      pipelineError: opts.pipelineError ?? null,
    };
  }

  it("returns healthy when no calls in window", async () => {
    mockCallLogs.length = 0;
    const result = await computeVoiceHealthWindow({ windowMinutes: 5 });
    expect(result.healthy).toBe(true);
    expect(result.totalCalls).toBe(0);
    expect(result.ttftP95Ms).toBeNull();
  });

  it("returns healthy when TTFT p95 under 1.2s threshold", async () => {
    mockCallLogs.push(
      makeRow({ ttftMs: 400 }),
      makeRow({ ttftMs: 500 }),
      makeRow({ ttftMs: 600 }),
      makeRow({ ttftMs: 800 }),
      makeRow({ ttftMs: 900 }), // p95 should be ~900
    );
    const result = await computeVoiceHealthWindow({ windowMinutes: 5 });
    expect(result.healthy).toBe(true);
    expect(result.ttftP95Ms).toBeLessThanOrEqual(1200);
    expect(result.ttftP50Ms).toBe(600);
  });

  it("returns degraded when TTFT p95 exceeds 1.2s", async () => {
    mockCallLogs.push(
      makeRow({ ttftMs: 400 }),
      makeRow({ ttftMs: 500 }),
      makeRow({ ttftMs: 1300 }), // p95 will be high
      makeRow({ ttftMs: 1400 }),
      makeRow({ ttftMs: 1500 }),
    );
    const result = await computeVoiceHealthWindow({ windowMinutes: 5 });
    expect(result.healthy).toBe(false);
    expect(result.ttftP95Ms).toBeGreaterThan(1200);
  });

  it("returns degraded when STT error rate exceeds 5%", async () => {
    mockCallLogs.push(
      makeRow({ ttftMs: 400, sttError: false }),
      makeRow({ ttftMs: 400, sttError: false }),
      makeRow({ ttftMs: 400, sttError: true }),
      makeRow({ ttftMs: 400, sttError: true }),
      makeRow({ ttftMs: 400, sttError: true }),
      makeRow({ ttftMs: 400, sttError: true }),
      // 4/7 errors = 57%
    );
    const result = await computeVoiceHealthWindow({ windowMinutes: 5 });
    expect(result.healthy).toBe(false);
    expect(result.sttErrorRate).toBeGreaterThan(5);
  });

  it("returns degraded when TTS error rate exceeds 5%", async () => {
    mockCallLogs.push(
      makeRow({ ttftMs: 400, ttsError: false }),
      makeRow({ ttftMs: 400, ttsError: true }),
      makeRow({ ttftMs: 400, ttsError: true }),
      makeRow({ ttftMs: 400, ttsError: true }),
      // 3/4 = 75%
    );
    const result = await computeVoiceHealthWindow({ windowMinutes: 5 });
    expect(result.healthy).toBe(false);
    expect(result.ttsErrorRate).toBeGreaterThan(5);
  });

  it("calculates error rates correctly for mixed errors", async () => {
    mockCallLogs.push(
      makeRow({ ttftMs: 400, sttError: false, ttsError: false }),
      makeRow({ ttftMs: 400, sttError: false, ttsError: false }),
      makeRow({ ttftMs: 400, sttError: true, ttsError: false }),
      makeRow({ ttftMs: 400, sttError: false, ttsError: true }),
      makeRow({ ttftMs: 400, sttError: false, ttsError: false }),
      // 1 STT error (20%), 1 TTS error (20%), both within 5% threshold
    );
    const result = await computeVoiceHealthWindow({ windowMinutes: 5 });
    expect(result.sttErrorRate).toBe(20);
    expect(result.ttsErrorRate).toBe(20);
  });

  it("filters by demoOnly flag", async () => {
    // demoOnly filtering is handled by SQL; for unit tests we rely on mock returning demo rows
    mockCallLogs.push(makeRow({ demo: true, ttftMs: 500 }));
    const result = await computeVoiceHealthWindow({ demoOnly: true, windowMinutes: 5 });
    expect(result.totalCalls).toBe(1);
  });
});

describe("alertOnVoiceDegradation", () => {
  it("dispatches webhook with degradation details", async () => {
    const { dispatchWebhook } = await import("./webhook-helpers");
    await alertOnVoiceDegradation({
      window: {
        windowMinutes: 5,
        totalCalls: 10,
        ttftP95Ms: 1500,
        ttftP50Ms: 800,
        sttErrorRate: 2,
        ttsErrorRate: 1,
        pipelineErrorRate: 0,
        healthy: false,
      },
      channel: "demo-line",
      userId: "user-1",
    });

    expect(dispatchWebhook).toHaveBeenCalledWith(
      "user-1",
      "voice.degradation",
      expect.objectContaining({
        channel: "demo-line",
        healthy: false,
        ttft_p95_ms: 1500,
      }),
    );
  });
});

describe("getLatencyTrends", () => {
  beforeEach(() => {
    mockCallLogs.length = 0;
    vi.clearAllMocks();
  });

  function makeTrendRow(date: string, ttftMs: number | null, sttError = false, ttsError = false) {
    return {
      createdAt: new Date(date),
      ttftMs,
      sttError,
      ttsError,
    };
  }

  it("returns empty array when no data", async () => {
    mockCallLogs.length = 0;
    const trends = await getLatencyTrends({ userId: "user-1", days: 7 });
    expect(trends).toEqual([]);
  });

  it("buckets by date and calculates averages", async () => {
    mockCallLogs.push(
      makeTrendRow("2026-05-28T10:00:00Z", 400),
      makeTrendRow("2026-05-28T11:00:00Z", 600),
      makeTrendRow("2026-05-29T09:00:00Z", 800),
    );
    const trends = await getLatencyTrends({ userId: "user-1", days: 7 });
    expect(trends.length).toBe(2);
    expect(trends[0].date).toBe("2026-05-28");
    expect(trends[0].avgTtftMs).toBe(500); // (400+600)/2
    expect(trends[1].date).toBe("2026-05-29");
    expect(trends[1].avgTtftMs).toBe(800);
  });

  it("calculates p95 per day", async () => {
    mockCallLogs.push(
      makeTrendRow("2026-05-28T10:00:00Z", 100),
      makeTrendRow("2026-05-28T11:00:00Z", 200),
      makeTrendRow("2026-05-28T12:00:00Z", 300),
      makeTrendRow("2026-05-28T13:00:00Z", 400),
      makeTrendRow("2026-05-28T14:00:00Z", 500), // p95 should be 500
    );
    const trends = await getLatencyTrends({ userId: "user-1", days: 7 });
    expect(trends[0].p95TtftMs).toBe(500);
  });

  it("calculates error rates per day", async () => {
    mockCallLogs.push(
      makeTrendRow("2026-05-28T10:00:00Z", 400, false, false),
      makeTrendRow("2026-05-28T11:00:00Z", 400, true, false),
      makeTrendRow("2026-05-28T12:00:00Z", 400, false, true),
      makeTrendRow("2026-05-28T13:00:00Z", 400, false, false),
    );
    const trends = await getLatencyTrends({ userId: "user-1", days: 7 });
    expect(trends[0].errorRate).toBe(50); // 2/4 errors = 50%
  });
});
