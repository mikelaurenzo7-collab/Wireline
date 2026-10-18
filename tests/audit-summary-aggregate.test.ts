import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { computeAuditSummary } from "../src/lib/audit-summary";
import {
  buildAuditSummaryQuery,
  formatAuditSummaryAggregate,
  type AuditSummaryAggregate,
} from "../src/lib/audit-summary-query";

function emptyAggregate(): AuditSummaryAggregate {
  return {
    totals: {
      calls: "0",
      cost: "0",
      input: "0",
      output: "0",
      cache_read: "0",
      cache_create: "0",
      cache_savings: "0",
      latency_sum: "0",
      p50_ms: null,
      p95_ms: null,
      sample_count: "0",
    },
    by_day: [],
    by_action: [],
    by_model: [],
  };
}

describe("whole-period audit summary aggregates", () => {
  it("preserves all 5,002 recorded events instead of sampling the newest 5,000", () => {
    const day = "2026-09-27";
    const model = "openai/gpt-5.6-terra";
    const ordinary = { action: "signup", createdAt: `${day}T00:00:00Z` };
    const rows = [
      ...Array.from({ length: 5_001 }, () => ({ ...ordinary })),
      {
        action: "training",
        model,
        createdAt: `${day}T01:00:00Z`,
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheReadTokens: 100_000,
        cacheCreateTokens: 100_000,
        costUsd: "1.120000",
        latencyMs: 600,
      },
    ];
    const actual = formatAuditSummaryAggregate(
      {
        totals: {
          calls: "5002",
          cost: "1.120000",
          input: "100000",
          output: "10000",
          cache_read: "100000",
          cache_create: "100000",
          cache_savings: "0.26",
          latency_sum: "600",
          p50_ms: 600,
          p95_ms: 600,
          sample_count: "1",
        },
        by_day: [{ day, calls: "5002", cost: "1.120000" }],
        by_action: [
          { action: "signup", calls: "5001", cost: "0", latency_sum: "0", sample_count: "0" },
          {
            action: "training",
            calls: "1",
            cost: "1.120000",
            latency_sum: "600",
            sample_count: "1",
          },
        ],
        by_model: [
          { model: "unknown", calls: "5001", cost: "0" },
          { model, calls: "1", cost: "1.120000" },
        ],
      },
      30,
    );
    expect(actual).toEqual(computeAuditSummary({ rows, windowDays: 30 }));
    expect(actual.totals.calls).toBeGreaterThan(5_000);
    expect(actual.totals.avg_latency).toBe(600);
    expect(actual.by_action.find((row) => row.action === "signup")?.calls).toBe(5_001);
  });

  it("preserves empty-period output with nullable percentile results", () => {
    expect(formatAuditSummaryAggregate(emptyAggregate(), 7)).toEqual(
      computeAuditSummary({ rows: [], windowDays: 7 }),
    );
  });

  it("uses only timed events for averages and percentiles while retaining all event counts", () => {
    const aggregate = emptyAggregate();
    aggregate.totals = {
      ...aggregate.totals,
      calls: "8",
      latency_sum: "117",
      p50_ms: 7,
      p95_ms: 100,
      sample_count: "5",
    };
    aggregate.by_action = [
      { action: "unknown", calls: "8", cost: "0", latency_sum: "117", sample_count: "5" },
    ];
    aggregate.by_model = [{ model: "unknown", calls: "8", cost: "0" }];
    const actual = formatAuditSummaryAggregate(aggregate, 1);
    expect(actual.totals).toMatchObject({ calls: 8, avg_latency: 23 });
    expect(actual.by_action[0]).toMatchObject({ calls: 8, avg_latency_ms: 23 });
    expect(actual.latency.sample_count).toBe(5);
    expect(actual).toEqual(
      computeAuditSummary({
        rows: [null, 0, -5, 1, 2, 7, 7, 100].map((latencyMs) => ({ latencyMs })),
        windowDays: 1,
      }),
    );
  });

  it("accepts sums beyond a 32-bit integer and refuses silently imprecise integer totals", () => {
    const aggregate = emptyAggregate();
    aggregate.totals.input = "4294967294";
    expect(formatAuditSummaryAggregate(aggregate, 30).totals.input).toBe(4_294_967_294);
    aggregate.totals.calls = "9007199254740993";
    expect(() => formatAuditSummaryAggregate(aggregate, 30)).toThrow("numeric range");
  });

  it("keeps cache overhead negative and rounds only after aggregation", () => {
    const aggregate = emptyAggregate();
    aggregate.totals.cache_savings = "-0.002817";
    aggregate.totals.cost = "0.000049";
    expect(formatAuditSummaryAggregate(aggregate, 30).totals).toMatchObject({
      cache_savings_usd: -0.0028,
      cost: 0,
    });
  });

  it("builds one parameterized, uncapped tenant/time snapshot with UTC days and SQL percentiles", () => {
    const userId = "00000000-0000-4000-8000-000000000123";
    const since = new Date("2026-08-28T18:30:00Z");
    const query = new PgDialect().sqlToQuery(buildAuditSummaryQuery(userId, since));
    expect(query.sql).toContain("with scoped as materialized");
    expect(query.sql).toMatch(/where "wireline_audit_log"\."user_id" = \$\d+/);
    expect(query.sql).toMatch(/"wireline_audit_log"\."created_at" >= \$\d+::timestamptz/);
    expect(query.params).toContain(userId);
    expect(query.params).toContain(since.toISOString());
    expect(query.sql).not.toContain(userId);
    expect(query.sql).not.toMatch(/\blimit\b/i);
    // Metadata may classify the guarded meter in WHERE, but event payloads
    // must never be selected or returned by this aggregate response.
    const scopedProjection = query.sql.slice(
      query.sql.indexOf("select"),
      query.sql.indexOf("from"),
    );
    expect(scopedProjection).not.toContain('"metadata"');
    expect(query.sql).toContain("not coalesce(");
    expect(query.sql).toContain("\"action\" = 'voice.realtime.session'");
    expect(query.sql).toContain("\"provider\" = 'openai'");
    expect(query.sql).toContain("\"metadata\"->>'surface' = 'openai_sip'");
    expect(query.sql).toContain("\"action\" = 'voice.phone_test.carrier'");
    expect(query.sql).toContain("\"provider\" = 'twilio'");
    expect(query.sql).toContain("\"metadata\"->>'surface' = 'phone_test'");
    expect(query.sql).toContain("\"action\" = 'voice.outbound.carrier'");
    expect(query.sql).toContain("\"metadata\"->>'surface' = 'native_outbound', false)");
    const nativeCarrierBranch = query.sql.slice(
      query.sql.indexOf("\"action\" = 'voice.outbound.carrier'"),
      query.sql.indexOf("\"metadata\"->>'surface' = 'native_outbound', false)") +
        "\"metadata\"->>'surface' = 'native_outbound', false)".length,
    );
    expect(nativeCarrierBranch).toContain("\"provider\" = 'twilio'");
    expect(query.sql).toContain("at time zone 'UTC'");
    expect(query.sql).toContain("percentile_disc(0.5)");
    expect(query.sql).toContain("percentile_disc(0.95)");
    expect(query.sql).toContain("filter (where latency_ms > 0)");
    expect(query.sql).toContain("input + cache_read + cache_create as prompt_tokens");
    expect(query.sql).toContain("::bigint as input");
    expect(query.sql).toContain("from scoped group by action");
    expect(query.sql).toContain("from scoped group by model");
  });
});
