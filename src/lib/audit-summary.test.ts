import { describe, it, expect } from "vitest";
import {
  computeAuditSummary,
  inputRateForModel,
  type AuditLogRow,
} from "./audit-summary";

function row(p: Partial<AuditLogRow>): AuditLogRow {
  return {
    action: p.action ?? null,
    provider: p.provider ?? null,
    model: p.model ?? null,
    input_tokens: p.input_tokens ?? null,
    output_tokens: p.output_tokens ?? null,
    cache_read_tokens: p.cache_read_tokens ?? null,
    cache_create_tokens: p.cache_create_tokens ?? null,
    cost_usd: p.cost_usd ?? null,
    latency_ms: p.latency_ms ?? null,
    created_at: p.created_at ?? "2026-05-07T12:00:00Z",
  };
}

describe("inputRateForModel", () => {
  it("returns the haiku rate for haiku models", () => {
    expect(inputRateForModel("claude-haiku-4-5-20251001")).toBe(1);
  });

  it("returns the sonnet rate for sonnet models", () => {
    expect(inputRateForModel("claude-sonnet-4-6")).toBe(3);
  });

  it("returns the opus/default rate for opus models and unknowns", () => {
    expect(inputRateForModel("claude-opus-4-7")).toBe(5);
    expect(inputRateForModel("gpt-4o")).toBe(5);
    expect(inputRateForModel(null)).toBe(5);
    expect(inputRateForModel(undefined)).toBe(5);
  });
});

describe("computeAuditSummary — totals", () => {
  it("returns zeros for empty input", () => {
    const r = computeAuditSummary({ rows: [], windowDays: 30 });
    expect(r.window_days).toBe(30);
    expect(r.totals).toEqual({
      calls: 0, cost: 0, input: 0, output: 0,
      cache_read: 0, cache_create: 0,
      cache_savings_usd: 0, avg_cost_per_call: 0,
    });
    expect(r.by_day).toEqual([]);
    expect(r.by_action).toEqual([]);
    expect(r.by_model).toEqual([]);
  });

  it("sums calls and tokens; rounds cost to 4 decimals", () => {
    const r = computeAuditSummary({
      rows: [
        row({ cost_usd: 0.001234567, input_tokens: 100, output_tokens: 200 }),
        row({ cost_usd: 0.002,       input_tokens: 50,  output_tokens: 0   }),
      ],
      windowDays: 7,
    });
    expect(r.totals.calls).toBe(2);
    expect(r.totals.input).toBe(150);
    expect(r.totals.output).toBe(200);
    expect(r.totals.cost).toBeCloseTo(0.0032, 4);
  });

  it("coerces string-form numerics (Postgres NUMERIC sometimes returns strings)", () => {
    const r = computeAuditSummary({
      rows: [row({ cost_usd: "0.5" as any, input_tokens: "100" as any })],
      windowDays: 7,
    });
    expect(r.totals.cost).toBe(0.5);
    expect(r.totals.input).toBe(100);
  });

  it("skips NaN cost without poisoning the total", () => {
    const r = computeAuditSummary({
      rows: [row({ cost_usd: "garbage" as any }), row({ cost_usd: 0.5 })],
      windowDays: 7,
    });
    expect(r.totals.cost).toBe(0.5);
  });

  it("avg_cost_per_call is 0 when there are no calls (no NaN division)", () => {
    const r = computeAuditSummary({ rows: [], windowDays: 7 });
    expect(r.totals.avg_cost_per_call).toBe(0);
  });
});

describe("computeAuditSummary — cache savings", () => {
  it("uses haiku rate (1x) for haiku cache reads", () => {
    // 1,000,000 cached tokens × $1/M × 0.9 = $0.90
    const r = computeAuditSummary({
      rows: [row({ model: "claude-haiku-4-5", cache_read_tokens: 1_000_000 })],
      windowDays: 7,
    });
    expect(r.totals.cache_savings_usd).toBeCloseTo(0.9, 4);
  });

  it("uses sonnet rate (3x) for sonnet cache reads", () => {
    const r = computeAuditSummary({
      rows: [row({ model: "claude-sonnet-4-6", cache_read_tokens: 1_000_000 })],
      windowDays: 7,
    });
    expect(r.totals.cache_savings_usd).toBeCloseTo(2.7, 4);
  });

  it("uses opus rate (5x) for opus cache reads and unknown models", () => {
    const r = computeAuditSummary({
      rows: [
        row({ model: "claude-opus-4-7", cache_read_tokens: 500_000 }),
        row({ model: null,              cache_read_tokens: 500_000 }),
      ],
      windowDays: 7,
    });
    // (500_000 * 5 * 0.9 + 500_000 * 5 * 0.9) / 1M = 4.5
    expect(r.totals.cache_savings_usd).toBeCloseTo(4.5, 4);
  });
});

describe("computeAuditSummary — by_day", () => {
  it("groups rows by UTC date and sorts ascending", () => {
    const r = computeAuditSummary({
      rows: [
        row({ created_at: "2026-05-07T08:00:00Z", cost_usd: 0.1 }),
        row({ created_at: "2026-05-05T23:30:00Z", cost_usd: 0.05 }),
        row({ created_at: "2026-05-07T09:00:00Z", cost_usd: 0.2 }),
      ],
      windowDays: 7,
    });
    expect(r.by_day.map(d => d.day)).toEqual(["2026-05-05", "2026-05-07"]);
    expect(r.by_day[1].calls).toBe(2);
    expect(r.by_day[1].cost).toBeCloseTo(0.3, 4);
  });

  it("skips rows with no created_at", () => {
    const r = computeAuditSummary({
      rows: [
        row({ created_at: null, cost_usd: 0.5 }),
        row({ created_at: "",   cost_usd: 0.5 }),
        row({ created_at: "2026-05-07T08:00:00Z", cost_usd: 0.1 }),
      ],
      windowDays: 7,
    });
    expect(r.by_day).toHaveLength(1);
    expect(r.by_day[0].day).toBe("2026-05-07");
    // by_day skips them, but totals.calls counts all 3 rows
    expect(r.totals.calls).toBe(3);
  });
});

describe("computeAuditSummary — by_action", () => {
  it("groups by action; sorts cost desc; rounds avg latency", () => {
    const r = computeAuditSummary({
      rows: [
        row({ action: "claude.brief",  cost_usd: 0.05, latency_ms: 1000 }),
        row({ action: "claude.brief",  cost_usd: 0.05, latency_ms: 1500 }),
        row({ action: "claude.recipe", cost_usd: 0.20, latency_ms: 200  }),
      ],
      windowDays: 7,
    });
    // recipe has higher total cost so it sorts first
    expect(r.by_action.map(a => a.action)).toEqual(["claude.recipe", "claude.brief"]);
    const brief = r.by_action.find(a => a.action === "claude.brief")!;
    expect(brief.calls).toBe(2);
    expect(brief.avg_latency_ms).toBe(1250);
    expect(brief.cost).toBeCloseTo(0.10, 4);
  });

  it("falls back to 'unknown' for null action", () => {
    const r = computeAuditSummary({
      rows: [row({ action: null, cost_usd: 0.5 })],
      windowDays: 7,
    });
    expect(r.by_action[0].action).toBe("unknown");
  });
});

describe("computeAuditSummary — by_model", () => {
  it("groups by model; sorts cost desc; falls back to 'unknown'", () => {
    const r = computeAuditSummary({
      rows: [
        row({ model: "haiku",  cost_usd: 0.01 }),
        row({ model: null,     cost_usd: 0.50 }),
        row({ model: "opus",   cost_usd: 0.20 }),
      ],
      windowDays: 7,
    });
    expect(r.by_model.map(m => m.model)).toEqual(["unknown", "opus", "haiku"]);
  });
});
