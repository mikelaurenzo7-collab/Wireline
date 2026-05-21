// src/lib/audit-summary.test.ts
import { describe, it, expect } from "vitest";
import { computeAuditSummary, inputRateForModel, type AuditLogRow } from "./audit-summary";

describe("inputRateForModel", () => {
  it("should conservatively price missing and unknown models at Opus rates", () => {
    expect(inputRateForModel(null)).toBe(15);
    expect(inputRateForModel(undefined)).toBe(15);
    expect(inputRateForModel("unknown-future-model")).toBe(15);
    expect(inputRateForModel("claude-opus")).toBe(15);
  });

  it("should price OpenAI and Gemini fallback models explicitly", () => {
    expect(inputRateForModel("gpt-4o")).toBe(5);
    expect(inputRateForModel("gpt-4-turbo")).toBe(10);
    expect(inputRateForModel("gemini-1.5-flash")).toBe(0.075);
    expect(inputRateForModel("gemini-1.5-pro")).toBe(1.25);
    expect(inputRateForModel("gemini-3-flash-preview")).toBe(0.3);
    expect(inputRateForModel("gemini-2.5-flash")).toBe(0.3);
  });

  it("should return 1 for haiku models", () => {
    expect(inputRateForModel("claude-3-haiku")).toBe(1);
    expect(inputRateForModel("anthropic-haiku")).toBe(1);
    expect(inputRateForModel("haiku-latest")).toBe(1);
  });

  it("should return 3 for sonnet models", () => {
    expect(inputRateForModel("claude-3-sonnet")).toBe(3);
    expect(inputRateForModel("anthropic-sonnet")).toBe(3);
    expect(inputRateForModel("sonnet-latest")).toBe(3);
  });
});

describe("computeAuditSummary", () => {
  it("should return empty summary for empty rows", () => {
    const result = computeAuditSummary({ rows: [], windowDays: 7 });

    expect(result.window_days).toBe(7);
    expect(result.totals.calls).toBe(0);
    expect(result.totals.cost).toBe(0);
    expect(result.totals.input).toBe(0);
    expect(result.totals.output).toBe(0);
    expect(result.totals.cache_read).toBe(0);
    expect(result.totals.cache_create).toBe(0);
    expect(result.totals.cache_savings_usd).toBe(0);
    expect(result.totals.avg_cost_per_call).toBe(0);
    expect(result.totals.avg_latency).toBe(0);
    expect(result.by_day).toEqual([]);
    expect(result.by_action).toEqual([]);
    expect(result.by_model).toEqual([]);
  });

  it("should handle camelCase field names", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        provider: "anthropic",
        model: "claude-3-haiku",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 200,
        cacheCreateTokens: 10,
        costUsd: 0.015,
        latencyMs: 1200,
        createdAt: "2024-01-15T10:30:00Z",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.calls).toBe(1);
    expect(result.totals.cost).toBe(0.015);
    expect(result.totals.input).toBe(100);
    expect(result.totals.output).toBe(50);
    expect(result.totals.cache_read).toBe(200);
    expect(result.totals.cache_create).toBe(10);
    expect(result.totals.avg_cost_per_call).toBe(0.015);
    expect(result.totals.avg_latency).toBe(1200);
  });

  it("should handle snake_case field names for backward compatibility", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        provider: "anthropic",
        model: "claude-3-haiku",
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 200,
        cache_create_tokens: 10,
        cost_usd: 0.015,
        latency_ms: 1200,
        created_at: "2024-01-15T10:30:00Z",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.calls).toBe(1);
    expect(result.totals.cost).toBe(0.015);
    expect(result.totals.input).toBe(100);
    expect(result.totals.output).toBe(50);
    expect(result.totals.cache_read).toBe(200);
    expect(result.totals.cache_create).toBe(10);
  });

  it("should handle mixed camelCase and snake_case fields", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        model: "claude-3-sonnet",
        inputTokens: 100,
        output_tokens: 50,
        costUsd: 0.02,
        latency_ms: 1000,
        createdAt: "2024-01-15T10:30:00Z",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.calls).toBe(1);
    expect(result.totals.cost).toBe(0.02);
    expect(result.totals.input).toBe(100);
    expect(result.totals.output).toBe(50);
  });

  it("should handle string numbers in fields", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        model: "claude-3-haiku",
        inputTokens: "150",
        outputTokens: "75",
        costUsd: "0.025",
        latencyMs: "800",
        createdAt: "2024-01-15T10:30:00Z",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.input).toBe(150);
    expect(result.totals.output).toBe(75);
    expect(result.totals.cost).toBe(0.025);
    expect(result.totals.avg_latency).toBe(800);
  });

  it("should handle null and undefined values", () => {
    const rows: AuditLogRow[] = [
      {
        action: null,
        model: null,
        inputTokens: null,
        outputTokens: undefined,
        costUsd: null,
        latencyMs: null,
        createdAt: null,
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.calls).toBe(1);
    expect(result.totals.input).toBe(0);
    expect(result.totals.output).toBe(0);
    expect(result.totals.cost).toBe(0);
    expect(result.by_action[0].action).toBe("unknown");
    expect(result.by_model[0].model).toBe("unknown");
  });

  it("should aggregate multiple rows correctly", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        model: "claude-3-haiku",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
        latencyMs: 1000,
        createdAt: "2024-01-15T10:30:00Z",
      },
      {
        action: "agent.updated",
        model: "claude-3-sonnet",
        inputTokens: 200,
        outputTokens: 100,
        costUsd: 0.02,
        latencyMs: 2000,
        createdAt: "2024-01-15T11:30:00Z",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.calls).toBe(2);
    expect(result.totals.input).toBe(300);
    expect(result.totals.output).toBe(150);
    expect(result.totals.cost).toBe(0.03);
    expect(result.totals.avg_cost_per_call).toBe(0.015);
    expect(result.totals.avg_latency).toBe(1500);
  });

  it("should group by day correctly", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        costUsd: 0.01,
        createdAt: "2024-01-15T10:30:00Z",
      },
      {
        action: "agent.updated",
        costUsd: 0.02,
        createdAt: "2024-01-15T14:30:00Z",
      },
      {
        action: "agent.created",
        costUsd: 0.03,
        createdAt: "2024-01-16T10:30:00Z",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.by_day).toHaveLength(2);
    expect(result.by_day[0].day).toBe("2024-01-15");
    expect(result.by_day[0].calls).toBe(2);
    expect(result.by_day[0].cost).toBe(0.03);
    expect(result.by_day[1].day).toBe("2024-01-16");
    expect(result.by_day[1].calls).toBe(1);
    expect(result.by_day[1].cost).toBe(0.03);
  });

  it("should group by action correctly", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        costUsd: 0.01,
        latencyMs: 1000,
      },
      {
        action: "agent.created",
        costUsd: 0.02,
        latencyMs: 2000,
      },
      {
        action: "agent.updated",
        costUsd: 0.06, // Higher cost to ensure clear sort order
        latencyMs: 1500,
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.by_action).toHaveLength(2);
    // Sorted by cost descending - agent.updated has 0.06, agent.created has 0.03
    expect(result.by_action[0].action).toBe("agent.updated");
    expect(result.by_action[0].calls).toBe(1);
    expect(result.by_action[0].cost).toBe(0.06);
    expect(result.by_action[0].avg_latency_ms).toBe(1500);

    expect(result.by_action[1].action).toBe("agent.created");
    expect(result.by_action[1].calls).toBe(2);
    expect(result.by_action[1].cost).toBe(0.03);
    expect(result.by_action[1].avg_latency_ms).toBe(1500); // (1000 + 2000) / 2
  });

  it("should group by model correctly", () => {
    const rows: AuditLogRow[] = [
      {
        model: "claude-3-haiku",
        costUsd: 0.01,
      },
      {
        model: "claude-3-haiku",
        costUsd: 0.02,
      },
      {
        model: "claude-3-sonnet",
        costUsd: 0.05,
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.by_model).toHaveLength(2);
    // Sorted by cost descending
    expect(result.by_model[0].model).toBe("claude-3-sonnet");
    expect(result.by_model[0].calls).toBe(1);
    expect(result.by_model[0].cost).toBe(0.05);

    expect(result.by_model[1].model).toBe("claude-3-haiku");
    expect(result.by_model[1].calls).toBe(2);
    expect(result.by_model[1].cost).toBe(0.03);
  });

  it("should calculate cache savings correctly", () => {
    const rows: AuditLogRow[] = [
      {
        model: "claude-3-haiku", // rate = 1
        cacheReadTokens: 1000000, // 1M tokens
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    // cache_savings = (1M * 1 * 0.9) / 1M = 0.9
    expect(result.totals.cache_savings_usd).toBe(0.9);
  });

  it("should handle Date objects in createdAt", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        costUsd: 0.01,
        createdAt: new Date("2024-01-15T10:30:00Z"),
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.by_day).toHaveLength(1);
    expect(result.by_day[0].day).toBe("2024-01-15");
  });

  it("should handle missing created_at gracefully", () => {
    const rows: AuditLogRow[] = [
      {
        action: "agent.created",
        costUsd: 0.01,
        // no createdAt or created_at
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    // Should still count the call in totals
    expect(result.totals.calls).toBe(1);
    expect(result.totals.cost).toBe(0.01);
    // But won't appear in by_day breakdown
    expect(result.by_day).toHaveLength(0);
  });

  it("should round cost values to 4 decimal places", () => {
    const rows: AuditLogRow[] = [
      {
        costUsd: 0.123456789,
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.cost).toBe(0.1235);
  });

  it("should handle invalid string values as 0", () => {
    const rows: AuditLogRow[] = [
      {
        inputTokens: "not-a-number",
        outputTokens: "invalid",
        costUsd: "also-invalid",
        latencyMs: "bad",
      },
    ];

    const result = computeAuditSummary({ rows, windowDays: 30 });

    expect(result.totals.calls).toBe(1);
    expect(result.totals.input).toBe(0);
    expect(result.totals.output).toBe(0);
    expect(result.totals.cost).toBe(0);
    expect(result.totals.avg_latency).toBe(0);
  });
});
