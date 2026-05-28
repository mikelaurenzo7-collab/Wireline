/**
 * agent-scorecard.test.ts
 * ----------------------------------------------------------------------
 * agent-scorecard.ts's header promises "this module gets dense test
 * coverage" because misreporting a conversion / resolution / lead-score
 * metric quietly mis-steers operators for weeks. This file makes good on
 * that promise: it exercises the delta math, the trend bucketing, and
 * every kpi_focus branch of computeScorecard.
 */
import { describe, expect, it } from "vitest";
import {
  pctDelta,
  buildTrend,
  computeScorecard,
  type CallLogRow,
  type ScorecardInput,
} from "./agent-scorecard";

describe("pctDelta", () => {
  it("computes a rounded percentage change", () => {
    expect(pctDelta(150, 100)).toBe(50);
    expect(pctDelta(50, 100)).toBe(-50);
    expect(pctDelta(100, 100)).toBe(0);
  });

  it("reports +100 when there is no prior baseline but current is non-zero", () => {
    expect(pctDelta(5, 0)).toBe(100);
  });

  it("reports 0 (not a green arrow) when both are zero", () => {
    expect(pctDelta(0, 0)).toBe(0);
  });

  it("guards against non-finite inputs", () => {
    expect(pctDelta(10, NaN)).toBe(100);
    expect(pctDelta(NaN, 100)).toBe(0);
  });
});

const DAY = 24 * 60 * 60 * 1000;

function logAt(id: string, msAgo: number, extra: Partial<CallLogRow> = {}): CallLogRow {
  return { id, created_at: new Date(Date.now() - msAgo).toISOString(), ...extra };
}

describe("buildTrend", () => {
  it("returns one bucket per day up to the 60-bucket cap", () => {
    expect(buildTrend([], Date.now(), 7)).toHaveLength(7);
    expect(buildTrend([], Date.now(), 365)).toHaveLength(60);
    expect(buildTrend([], Date.now(), 0)).toHaveLength(1);
  });

  it("buckets logs into the window and ignores out-of-range / unparsable rows", () => {
    const now = Date.now();
    const logs: CallLogRow[] = [
      logAt("a", 0.5 * DAY), // today-ish
      logAt("b", 1.5 * DAY),
      { id: "c", created_at: "garbage" }, // unparsable → skipped
      logAt("d", 100 * DAY), // older than window → clamped to bucket 0
    ];
    const trend = buildTrend(logs, now, 3);
    expect(trend).toHaveLength(3);
    expect(trend.reduce((s, n) => s + n, 0)).toBe(3); // only 3 parsable rows counted
  });

  it("places a now-stamped log in the final bucket", () => {
    const now = Date.now();
    const trend = buildTrend([logAt("z", 0)], now, 5);
    expect(trend[trend.length - 1]).toBe(1);
  });
});

function baseInput(overrides: Partial<ScorecardInput> = {}): ScorecardInput {
  return {
    focus: "general",
    windowDays: 7,
    now: Date.now(),
    currentLogs: [],
    priorLogs: [],
    appointments: [],
    openFollowUps: [],
    ...overrides,
  };
}

describe("computeScorecard", () => {
  it("general focus reports call volume with a delta vs the prior window", () => {
    const res = computeScorecard(
      baseInput({
        currentLogs: [logAt("1", DAY), logAt("2", DAY), logAt("3", DAY)],
        priorLogs: [logAt("p1", DAY), logAt("p2", DAY)],
      }),
    );
    expect(res.kpi_focus).toBe("general");
    expect(res.primary.label).toBe("Calls handled");
    expect(res.primary.value).toBe(3);
    expect(res.primary.delta_pct).toBe(50); // 3 vs 2
    expect(res.sample_size).toBe(3);
  });

  it("conversions focus = appointments / calls, prior baseline intentionally 0", () => {
    const res = computeScorecard(
      baseInput({
        focus: "conversions",
        currentLogs: [logAt("1", DAY), logAt("2", DAY), logAt("3", DAY), logAt("4", DAY)],
        appointments: [{ id: "a1" }, { id: "a2" }],
      }),
    );
    expect(res.primary.label).toBe("Conversion rate");
    expect(res.primary.value).toBeCloseTo(0.5, 5); // 2 / 4
    expect(res.primary.format).toBe("percent");
    expect(res.secondary[0]).toEqual({ label: "Conversions", value: 2, format: "number" });
  });

  it("qualifications focus averages only the scored calls", () => {
    const res = computeScorecard(
      baseInput({
        focus: "qualifications",
        currentLogs: [
          logAt("1", DAY, { lead_score: 80 }),
          logAt("2", DAY, { lead_score: 40 }),
          logAt("3", DAY, { lead_score: 0 }), // unscored → excluded from avg
        ],
      }),
    );
    expect(res.primary.label).toBe("Avg lead score");
    expect(res.primary.value).toBe(60); // (80 + 40) / 2
  });

  it("resolutions focus counts calls without an open follow-up as resolved", () => {
    const res = computeScorecard(
      baseInput({
        focus: "resolutions",
        currentLogs: [logAt("c1", DAY), logAt("c2", DAY), logAt("c3", DAY)],
        openFollowUps: [{ id: "f1", source_id: "c1" }],
      }),
    );
    expect(res.primary.label).toBe("First-contact resolution");
    expect(res.primary.value).toBeCloseTo(2 / 3, 5); // c2 + c3 resolved
  });

  it("satisfaction focus measures the positive-sentiment rate", () => {
    const res = computeScorecard(
      baseInput({
        focus: "satisfaction",
        currentLogs: [
          logAt("1", DAY, { sentiment: "positive" }),
          logAt("2", DAY, { sentiment: "Positive" }), // case-insensitive
          logAt("3", DAY, { sentiment: "neutral" }),
          logAt("4", DAY, { sentiment: "negative" }),
        ],
      }),
    );
    expect(res.primary.label).toBe("Positive sentiment");
    expect(res.primary.value).toBeCloseTo(0.5, 5);
  });

  it("unknown focus falls back to the general scorecard", () => {
    const res = computeScorecard(baseInput({ focus: "mystery-kpi" }));
    expect(res.primary.label).toBe("Calls handled");
  });

  it("never divides by zero on an empty window", () => {
    const res = computeScorecard(baseInput({ focus: "conversions" }));
    expect(res.primary.value).toBe(0);
    expect(res.sample_size).toBe(0);
    expect(Number.isFinite(res.primary.value)).toBe(true);
  });
});
