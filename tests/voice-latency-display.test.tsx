import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceLatencyView from "../src/components/insights/VoiceLatencyView";
import voiceRouter from "../src/routes/voice-observability-routes";

const h = vi.hoisted(() => ({
  cursor: 0,
  voice: {} as Record<string, unknown>,
  trends: vi.fn(),
  reliability: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    [
      { latency: { sample_count: 1, p50_ms: 10, p95_ms: 20 }, totals: { avg_latency: 15 } },
      h.voice,
      false,
      null,
      0,
    ][h.cursor++],
    vi.fn(),
  ],
  useEffect: vi.fn(),
}));
vi.mock("../src/components/insights/shared", () => ({
  fetchInsight: vi.fn(),
  InsightSkeleton: "loading",
  ErrCard: "error",
  InsightEmpty: "empty",
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { error: vi.fn() },
  requirePermission: () => vi.fn(),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ insightsRateLimit: vi.fn() }));
vi.mock("../src/lib/api-validation", () => ({ validateQuery: () => vi.fn() }));
vi.mock("../src/lib/voice-observability", () => ({ getLatencyTrends: h.trends }));
vi.mock("../src/lib/voice-reliability", () => ({ getVoiceReliabilityPayload: h.reliability }));

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function trendHeights(node: ReactNode): unknown[] {
  if (Array.isArray(node)) return node.flatMap(trendHeights);
  if (!isValidElement<{ children?: ReactNode; title?: string; style?: { height?: string } }>(node))
    return [];
  return [
    ...(node.props.title?.includes(": avg ") ? [node.props.style?.height] : []),
    ...trendHeights(node.props.children),
  ];
}

type Handler = (request: unknown, response: unknown) => Promise<void>;
const layers = (
  voiceRouter as unknown as {
    stack: { route?: { path: string; stack: { handle: Handler }[] } }[];
  }
).stack;
const route = layers.find((layer) => layer.route?.path === "/api/insights/latency")!.route!;
const latencyHandler = route.stack[route.stack.length - 1].handle;
const reliabilityRoute = layers.find(
  (layer) => layer.route?.path === "/api/insights/voice-reliability",
)!.route!;
const reliabilityHandler = reliabilityRoute.stack[reliabilityRoute.stack.length - 1].handle;

beforeEach(() => {
  vi.clearAllMocks();
  h.cursor = 0;
  h.voice = {
    days: 30,
    trends: [{ date: "2026-09-20", avgTtftMs: 440, p95TtftMs: 700, errorRate: 0 }],
    generated_at: "2026-09-20T00:00:00Z",
  };
  h.trends.mockResolvedValue(h.voice.trends);
});
afterEach(() => vi.unstubAllEnvs());

describe("voice latency configured call limit", () => {
  it.each([
    ["1800", 1800],
    ["3600", 3600],
    ["", 3600],
  ])("returns the resolved %s-second deployment policy", async (configured, expected) => {
    vi.stubEnv("OPENAI_SIP_MAX_CALL_SECONDS", configured);
    const json = vi.fn();
    await latencyHandler({ user: { id: "tenant-a" }, query: { days: "7" } }, { json });
    expect(h.trends).toHaveBeenCalledWith({ userId: "tenant-a", days: 7 });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        days: 7,
        trends: h.voice.trends,
        max_call_seconds: expected,
      }),
    );
  });

  it.each([
    [1800, "30 min"],
    [3600, "60 min"],
  ])("shows the API's %s-second limit", (seconds, expected) => {
    h.voice.max_call_seconds = seconds;
    const content = text(VoiceLatencyView({ days: 30 }));
    expect(content).toContain(`Max Call Length${expected}`);
    expect(content).not.toContain("PSTN call ceiling");
  });

  it.each([undefined, null, 0, -1])("omits a missing or invalid limit (%s)", (seconds) => {
    h.voice.max_call_seconds = seconds;
    const content = text(VoiceLatencyView({ days: 30 }));
    expect(content).not.toContain("Max Call Length");
    expect(content).not.toContain("PSTN call ceiling");
  });

  it("labels the API mean as an average instead of a median", () => {
    const content = text(VoiceLatencyView({ days: 30 }));
    expect(content).toContain("Average TTFT440ms");
    expect(content).not.toContain("TTFT p50");
  });

  it("keeps high latencies proportional and gives missing or zero samples no bar height", () => {
    h.voice.trends = [1500, 3000, null, 0, 750].map((avgTtftMs, index) => ({
      date: `2026-09-${16 + index}`,
      avgTtftMs,
      p95TtftMs: avgTtftMs,
      errorRate: 0,
    }));
    const view = VoiceLatencyView({ days: 30 });
    expect(trendHeights(view)).toEqual(["50%", "100%", "0%", "0%", "25%"]);
    expect(text(view)).toContain("3000ms");
  });

  it("retains a measured zero as zero instead of claiming a missing sample", () => {
    h.voice.trends = [{ date: "2026-09-20", avgTtftMs: 0, p95TtftMs: 0, errorRate: 0 }];
    const content = text(VoiceLatencyView({ days: 30 }));
    expect(content).toContain("Average TTFT0ms");
    expect(content).toContain("TTFT p950ms");
  });
});

describe("customer voice reliability response", () => {
  it("omits internal unit economics and bases customer health on call reliability", async () => {
    h.reliability.mockResolvedValue({
      summary: {
        windowDays: 7,
        totalCalls: 1,
        latency: { ttftP95Ms: 600, healthy: true },
        hangups: { abnormalRatePct: 0, byReason: {} },
        toolCalls: { successRatePct: null },
        escalations: { successRatePct: null },
        webhooks: { failureRatePct: null },
        economics: { cogsPerMinUsd: 999, grossMarginPct: -999 },
        healthy: false,
      },
      trends: [
        {
          date: "2026-10-13",
          totalCalls: 1,
          avgTtftMs: 600,
          p95TtftMs: 600,
          abnormalHangupRate: 0,
          toolCallFailureRate: 0,
          webhookFailureRate: 0,
          cogsPerMinUsd: 999,
        },
      ],
      generatedAt: "2026-10-13T00:00:00Z",
    });
    const json = vi.fn();
    await reliabilityHandler({ user: { id: "tenant-a" }, query: { days: 7 } }, { json });
    const result = json.mock.calls[0][0];
    expect(result.summary.healthy).toBe(true);
    expect(result.summary).not.toHaveProperty("economics");
    expect(result.trends[0]).not.toHaveProperty("cogsPerMinUsd");
    expect(h.reliability).toHaveBeenCalledWith({ userId: "tenant-a", days: 7 });
  });
});
