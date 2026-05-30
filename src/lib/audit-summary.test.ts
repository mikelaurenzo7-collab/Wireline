/**
 * audit-summary — pure aggregation math for the /api/audit/summary view.
 * Pins p50/p95 latency edges, model-rate lookup (exact + heuristic), and
 * the full by-day/by-action/by-model rollup including cache-savings math
 * so that the InsightsView + AdminSettings audit panel stay numerically
 * stable across refactors.
 */
import { describe, it, expect } from "vitest";
import {
  computeAuditSummary,
  computeLatencyPercentiles,
  inputRateForModel,
  type AuditLogRow,
} from "./audit-summary.js";

describe("computeLatencyPercentiles", () => {
  it("returns zeroed bucket for empty input", () => {
    expect(computeLatencyPercentiles([])).toEqual({ p50_ms: 0, p95_ms: 0, sample_count: 0 });
  });

  it("ignores zero / non-positive latencies", () => {
    const rows: AuditLogRow[] = [
      { latencyMs: 0 },
      { latency_ms: -5 },
      { latencyMs: 100 },
      { latencyMs: 200 },
    ];
    const out = computeLatencyPercentiles(rows);
    expect(out.sample_count).toBe(2);
    expect(out.p50_ms).toBe(100);
    expect(out.p95_ms).toBe(200);
  });

  it("computes p50 and p95 across a sorted distribution", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ latencyMs: i + 1 }));
    const out = computeLatencyPercentiles(rows);
    expect(out.sample_count).toBe(100);
    expect(out.p50_ms).toBe(50);
    expect(out.p95_ms).toBe(95);
  });
});

describe("inputRateForModel", () => {
  it("returns 15 as the default when model is null/undefined/empty", () => {
    expect(inputRateForModel(null)).toBe(15);
    expect(inputRateForModel(undefined)).toBe(15);
    expect(inputRateForModel("")).toBe(15);
  });

  it("uses exact lookup for known SKUs", () => {
    expect(inputRateForModel("claude-haiku-4-5")).toBe(1);
    expect(inputRateForModel("claude-sonnet-4-6")).toBe(3);
    expect(inputRateForModel("claude-opus-4-7")).toBe(15);
    expect(inputRateForModel("gemini-1.5-flash")).toBe(0.075);
    expect(inputRateForModel("gpt-4o")).toBe(5);
  });

  it("falls back to family heuristics for unknown variants", () => {
    expect(inputRateForModel("anthropic.claude-haiku-bedrock")).toBe(1);
    expect(inputRateForModel("anthropic.claude-sonnet-bedrock")).toBe(3);
    expect(inputRateForModel("anthropic.claude-opus-bedrock")).toBe(15);
    // Unknown family → conservative 15 (opus-tier) to avoid under-reporting cost.
    expect(inputRateForModel("mystery-llm-v9")).toBe(15);
  });
});

describe("computeAuditSummary", () => {
  it("returns a zeroed summary for an empty audit window", () => {
    const out = computeAuditSummary({ rows: [], windowDays: 7 });
    expect(out.window_days).toBe(7);
    expect(out.totals).toEqual({
      calls: 0,
      cost: 0,
      input: 0,
      output: 0,
      cache_read: 0,
      cache_create: 0,
      cache_savings_usd: 0,
      avg_cost_per_call: 0,
      avg_latency: 0,
    });
    expect(out.by_day).toEqual([]);
    expect(out.by_action).toEqual([]);
    expect(out.by_model).toEqual([]);
    expect(out.latency.sample_count).toBe(0);
  });

  it("aggregates totals, by_day, by_action, by_model and cache savings", () => {
    const rows: AuditLogRow[] = [
      {
        action: "chat",
        model: "claude-sonnet-4-6",
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 1_000_000, // 1M cached input tokens
        cacheCreateTokens: 0,
        costUsd: "0.01",
        latencyMs: 100,
        createdAt: "2026-05-01T10:00:00Z",
      },
      {
        action: "chat",
        model: "claude-sonnet-4-6",
        input_tokens: 2000,
        output_tokens: 1000,
        cost_usd: 0.02,
        latency_ms: 300,
        created_at: "2026-05-01T11:00:00Z",
      },
      {
        action: "tool_call",
        model: "gpt-4o",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: 0.05,
        latencyMs: 800,
        createdAt: new Date("2026-05-02T09:00:00Z"),
      },
      {
        // Missing date → contributes to totals but NOT by_day.
        action: "tool_call",
        model: null,
        costUsd: 0.001,
      },
    ];

    const out = computeAuditSummary({ rows, windowDays: 30 });

    expect(out.window_days).toBe(30);
    expect(out.totals.calls).toBe(4);
    expect(out.totals.input).toBe(3500);
    expect(out.totals.output).toBe(1700);
    expect(out.totals.cache_read).toBe(1_000_000);
    expect(out.totals.cost).toBeCloseTo(0.081, 4);
    expect(out.totals.avg_cost_per_call).toBeCloseTo(0.0203, 4);
    // 1M cached input tokens at $3/MTok * 0.9 savings ratio = $2.70
    expect(out.totals.cache_savings_usd).toBeCloseTo(2.7, 4);
    expect(out.totals.avg_latency).toBe(Math.round((100 + 300 + 800 + 0) / 4));

    // by_day sorted ascending, skips the undated row.
    expect(out.by_day.map((d) => d.day)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(out.by_day[0].calls).toBe(2);
    expect(out.by_day[0].cost).toBeCloseTo(0.03, 4);

    // by_action sorted by cost DESC; tool_call (0.051) before chat (0.03).
    expect(out.by_action[0].action).toBe("tool_call");
    expect(out.by_action[0].calls).toBe(2);
    expect(out.by_action[0].avg_latency_ms).toBe(Math.round((800 + 0) / 2));
    expect(out.by_action[1].action).toBe("chat");
    expect(out.by_action[1].avg_latency_ms).toBe(Math.round((100 + 300) / 2));

    // by_model sorted by cost DESC; gpt-4o highest, then claude, then "unknown".
    expect(out.by_model.map((m) => m.model)).toEqual(["gpt-4o", "claude-sonnet-4-6", "unknown"]);

    expect(out.latency.sample_count).toBe(3);
    expect(out.latency.p50_ms).toBeGreaterThan(0);
  });

  it("buckets unlabeled actions/models under 'unknown'", () => {
    const out = computeAuditSummary({
      rows: [{ costUsd: 0.5, latencyMs: 10, createdAt: "2026-01-01T00:00:00Z" }],
      windowDays: 1,
    });
    expect(out.by_action[0].action).toBe("unknown");
    expect(out.by_model[0].model).toBe("unknown");
    expect(out.totals.calls).toBe(1);
  });
});
