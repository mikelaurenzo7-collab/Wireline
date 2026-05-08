import { describe, it, expect } from "vitest";
import {
  computeDashboardBenchmarks,
  HOT_LEAD_THRESHOLD,
  CONTACTED_STATUSES,
  BENCHMARK_TARGETS,
  type CallLogRow,
  type OutboundLeadRow,
} from "./dashboard-benchmarks";

const call = (p: Partial<CallLogRow>): CallLogRow => ({
  duration_seconds: p.duration_seconds ?? null,
  lead_score: p.lead_score ?? null,
  intent_label: p.intent_label ?? null,
  cost: p.cost ?? null,
  qa_score: p.qa_score ?? null,
});

describe("computeDashboardBenchmarks — empty input", () => {
  it("returns zeros (no NaN division) when there are no calls / leads / agents", () => {
    const { benchmarks, total_calls } = computeDashboardBenchmarks({
      calls: [], leads: [], agentCount: 0,
    });
    expect(total_calls).toBe(0);
    expect(benchmarks.call_volume.user).toBe(0);
    expect(benchmarks.avg_duration.user).toBe(0);
    expect(benchmarks.lead_score.user).toBe(0);
    expect(benchmarks.conversion_rate.user).toBe(0);
    expect(benchmarks.contact_rate.user).toBe(0);
    expect(benchmarks.agent_utilization.user).toBe(0);
  });

  it("preserves the full BENCHMARK_TARGETS shape on each entry", () => {
    const { benchmarks } = computeDashboardBenchmarks({ calls: [], leads: [], agentCount: 0 });
    expect(benchmarks.call_volume.label).toBe(BENCHMARK_TARGETS.call_volume.label);
    expect(benchmarks.call_volume.unit).toBe(BENCHMARK_TARGETS.call_volume.unit);
    expect(benchmarks.call_volume.better_when).toBe(BENCHMARK_TARGETS.call_volume.better_when);
    expect(benchmarks.call_volume.benchmark).toBe(BENCHMARK_TARGETS.call_volume.benchmark);
    expect(benchmarks.call_volume.tip).toContain("calls per hour");
  });
});

describe("computeDashboardBenchmarks — call metrics", () => {
  it("counts every call in total_calls regardless of duration", () => {
    const { total_calls } = computeDashboardBenchmarks({
      calls: [call({}), call({}), call({})],
      leads: [], agentCount: 1,
    });
    expect(total_calls).toBe(3);
  });

  it("rounds avg duration to nearest int", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [call({ duration_seconds: 90 }), call({ duration_seconds: 121 })],
      leads: [], agentCount: 1,
    });
    expect(benchmarks.avg_duration.user).toBe(106);  // 211/2 = 105.5 → 106
  });

  it("treats null duration as 0", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [call({ duration_seconds: null }), call({ duration_seconds: 60 })],
      leads: [], agentCount: 1,
    });
    expect(benchmarks.avg_duration.user).toBe(30);
  });
});

describe("computeDashboardBenchmarks — lead score / conversion", () => {
  it(`counts a call as hot when lead_score >= ${HOT_LEAD_THRESHOLD}`, () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [
        call({ lead_score: HOT_LEAD_THRESHOLD - 1 }),  // not hot
        call({ lead_score: HOT_LEAD_THRESHOLD }),      // hot (boundary)
        call({ lead_score: 95 }),                       // hot
        call({ lead_score: null }),                     // not hot (treated as 0)
      ],
      leads: [], agentCount: 1,
    });
    expect(benchmarks.conversion_rate.user).toBe(50);  // 2/4 = 50%
  });

  it("rounds avg lead score to nearest int (null = 0)", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [
        call({ lead_score: 80 }),
        call({ lead_score: 60 }),
        call({ lead_score: null }),  // counted as 0 in the average
      ],
      leads: [], agentCount: 1,
    });
    expect(benchmarks.lead_score.user).toBe(47);  // (80+60+0)/3 = 46.67 → 47
  });
});

describe("computeDashboardBenchmarks — contact rate", () => {
  it("counts only the whitelist of statuses as contacted", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [],
      leads: [
        { status: "Completed" },     // contacted
        { status: "Interested" },    // contacted
        { status: "Callback" },      // contacted
        { status: "Failed" },        // not contacted
        { status: "Queued" },        // not contacted
        { status: null },            // not contacted
      ],
      agentCount: 1,
    });
    // 3 / 6 = 50%
    expect(benchmarks.contact_rate.user).toBe(50);
  });

  it("returns 0 when there are no dialed leads (no NaN)", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [call({})],
      leads: [],
      agentCount: 1,
    });
    expect(benchmarks.contact_rate.user).toBe(0);
  });

  it("CONTACTED_STATUSES constant is the operator-facing whitelist", () => {
    expect(CONTACTED_STATUSES.has("Completed")).toBe(true);
    expect(CONTACTED_STATUSES.has("Interested")).toBe(true);
    expect(CONTACTED_STATUSES.has("Callback")).toBe(true);
    expect(CONTACTED_STATUSES.has("Failed")).toBe(false);
    expect(CONTACTED_STATUSES.has("completed")).toBe(false);  // case-sensitive
  });
});

describe("computeDashboardBenchmarks — agent utilization", () => {
  it("returns 0 when agentCount is 0 (no division by zero)", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: [call({}), call({})],
      leads: [],
      agentCount: 0,
    });
    expect(benchmarks.agent_utilization.user).toBe(0);
  });

  it("computes calls / (agents * 100) as a percentage", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: Array.from({ length: 50 }, () => call({})),
      leads: [],
      agentCount: 1,   // 50 calls / 100 capacity = 50%
    });
    expect(benchmarks.agent_utilization.user).toBe(50);
  });

  it("clamps to 100% even when calls exceed nominal capacity", () => {
    const { benchmarks } = computeDashboardBenchmarks({
      calls: Array.from({ length: 500 }, () => call({})),
      leads: [],
      agentCount: 1,
    });
    expect(benchmarks.agent_utilization.user).toBe(100);
  });
});
