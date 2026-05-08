import { describe, it, expect } from "vitest";
import { computeQAStats, type QACallRow } from "./qa-stats";

// ─── helpers ─────────────────────────────────────────────────────────────

function makeCall(
  score: number,
  date: string,
  breakdown?: Record<string, number>,
): QACallRow {
  return {
    qa_score: score,
    created_at: `${date}T12:00:00Z`,
    qa_breakdown: breakdown
      ? { greeting: 0, discovery: 0, solution: 0, objection: 0, closing: 0, ...breakdown }
      : null,
  };
}

// ─── empty result ─────────────────────────────────────────────────────────

describe("computeQAStats — empty input", () => {
  it("returns count=0 and avgScore=0", () => {
    const r = computeQAStats([]);
    expect(r.count).toBe(0);
    expect(r.avgScore).toBe(0);
  });

  it("returns 5 distribution buckets all with count=0", () => {
    const r = computeQAStats([]);
    expect(r.distribution).toHaveLength(5);
    r.distribution.forEach((b) => expect(b.count).toBe(0));
  });

  it("returns all-zero dimensions", () => {
    const r = computeQAStats([]);
    const dims = r.dimensions;
    expect(dims.greeting).toBe(0);
    expect(dims.discovery).toBe(0);
    expect(dims.solution).toBe(0);
    expect(dims.objection).toBe(0);
    expect(dims.closing).toBe(0);
  });

  it("returns empty trend array", () => {
    expect(computeQAStats([]).trend).toHaveLength(0);
  });
});

// ─── count + avgScore ─────────────────────────────────────────────────────

describe("computeQAStats — count and avgScore", () => {
  it("count equals number of calls", () => {
    const calls = [makeCall(50, "2026-01-01"), makeCall(70, "2026-01-01")];
    expect(computeQAStats(calls).count).toBe(2);
  });

  it("avgScore is rounded mean of qa_score values", () => {
    // 60 + 70 + 80 = 210 / 3 = 70 exactly
    const calls = [makeCall(60, "2026-01-01"), makeCall(70, "2026-01-01"), makeCall(80, "2026-01-01")];
    expect(computeQAStats(calls).avgScore).toBe(70);
  });

  it("avgScore rounds to nearest integer (0.5 → up)", () => {
    // 60 + 61 = 121 / 2 = 60.5 → rounds to 61
    const calls = [makeCall(60, "2026-01-01"), makeCall(61, "2026-01-01")];
    expect(computeQAStats(calls).avgScore).toBe(61);
  });

  it("handles null qa_score (treated as 0)", () => {
    const calls: QACallRow[] = [
      { qa_score: null, created_at: "2026-01-01T12:00:00Z" },
      { qa_score: 100,  created_at: "2026-01-01T12:00:00Z" },
    ];
    // avg = 50
    expect(computeQAStats(calls).avgScore).toBe(50);
  });
});

// ─── distribution ─────────────────────────────────────────────────────────

describe("computeQAStats — distribution buckets", () => {
  it("always returns exactly 5 buckets with correct labels", () => {
    const r = computeQAStats([makeCall(50, "2026-01-01")]);
    const labels = r.distribution.map((b) => b.label);
    expect(labels).toEqual([
      "Poor (0–39)", "Fair (40–59)", "Good (60–74)", "Great (75–89)", "Excellent (90+)",
    ]);
  });

  it("buckets are mutually exclusive — 5 calls produce 5 single-count buckets", () => {
    const calls = [
      makeCall(20,  "2026-01-01"), // Poor
      makeCall(50,  "2026-01-01"), // Fair
      makeCall(65,  "2026-01-01"), // Good
      makeCall(85,  "2026-01-01"), // Great
      makeCall(95,  "2026-01-01"), // Excellent
    ];
    const r = computeQAStats(calls);
    r.distribution.forEach((b) => expect(b.count).toBe(1));
  });

  it("boundary 39 → Poor, 40 → Fair", () => {
    const calls = [makeCall(39, "2026-01-01"), makeCall(40, "2026-01-01")];
    const r = computeQAStats(calls);
    expect(r.distribution.find((b) => b.label.startsWith("Poor"))!.count).toBe(1);
    expect(r.distribution.find((b) => b.label.startsWith("Fair"))!.count).toBe(1);
  });

  it("boundary 89 → Great, 90 → Excellent", () => {
    const calls = [makeCall(89, "2026-01-01"), makeCall(90, "2026-01-01")];
    const r = computeQAStats(calls);
    expect(r.distribution.find((b) => b.label.startsWith("Great"))!.count).toBe(1);
    expect(r.distribution.find((b) => b.label.startsWith("Excellent"))!.count).toBe(1);
  });

  it("score 100 lands in Excellent bucket (max=100 inclusive)", () => {
    const r = computeQAStats([makeCall(100, "2026-01-01")]);
    expect(r.distribution.find((b) => b.label.startsWith("Excellent"))!.count).toBe(1);
  });

  it("multiple calls can land in the same bucket", () => {
    const calls = [makeCall(50, "2026-01-01"), makeCall(55, "2026-01-01"), makeCall(58, "2026-01-01")];
    const r = computeQAStats(calls);
    expect(r.distribution.find((b) => b.label.startsWith("Fair"))!.count).toBe(3);
  });
});

// ─── dimensions ──────────────────────────────────────────────────────────

describe("computeQAStats — dimension averages", () => {
  it("averages are 0 when no call has a breakdown", () => {
    const calls = [makeCall(50, "2026-01-01"), makeCall(70, "2026-01-01")];
    const r = computeQAStats(calls);
    Object.values(r.dimensions).forEach((v) => expect(v).toBe(0));
  });

  it("computes per-dimension averages to 1 decimal place", () => {
    const calls = [
      makeCall(80, "2026-01-01", { greeting: 15, discovery: 10, solution: 20, objection: 18, closing: 17 }),
      makeCall(60, "2026-01-01", { greeting: 10, discovery: 14, solution: 12, objection: 16, closing: 8  }),
    ];
    const r = computeQAStats(calls);
    expect(r.dimensions.greeting).toBe(12.5);
    expect(r.dimensions.discovery).toBe(12);
    expect(r.dimensions.solution).toBe(16);
    expect(r.dimensions.objection).toBe(17);
    expect(r.dimensions.closing).toBe(12.5);
  });

  it("only calls with non-null breakdown count toward dimension averages", () => {
    const calls: QACallRow[] = [
      makeCall(80, "2026-01-01", { greeting: 20, discovery: 20, solution: 20, objection: 20, closing: 20 }),
      { qa_score: 40, created_at: "2026-01-01T12:00:00Z", qa_breakdown: null },
    ];
    // Only the first call contributes to dimensions
    const r = computeQAStats(calls);
    expect(r.dimensions.greeting).toBe(20);
  });

  it("handles null dimension values within breakdown (treated as 0)", () => {
    const calls: QACallRow[] = [
      {
        qa_score: 80,
        created_at: "2026-01-01T12:00:00Z",
        qa_breakdown: { greeting: null, discovery: 10, solution: 0, objection: 0, closing: 0 },
      },
    ];
    const r = computeQAStats(calls);
    expect(r.dimensions.greeting).toBe(0);
    expect(r.dimensions.discovery).toBe(10);
  });
});

// ─── trend ────────────────────────────────────────────────────────────────

describe("computeQAStats — trend", () => {
  it("trend is sorted ascending by date", () => {
    const calls = [
      makeCall(60, "2026-01-03"),
      makeCall(80, "2026-01-01"),
      makeCall(70, "2026-01-02"),
    ];
    const r = computeQAStats(calls);
    const days = r.trend.map((t) => t.day);
    expect(days).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("trend contains at most 7 points (last 7 days with data)", () => {
    const calls = Array.from({ length: 10 }, (_, i) =>
      makeCall(50 + i, `2026-01-${String(i + 1).padStart(2, "0")}`),
    );
    const r = computeQAStats(calls);
    expect(r.trend.length).toBeLessThanOrEqual(7);
  });

  it("trend picks the LAST 7 data days, not any 7", () => {
    const calls = Array.from({ length: 10 }, (_, i) =>
      makeCall(50 + i, `2026-01-${String(i + 1).padStart(2, "0")}`),
    );
    const r = computeQAStats(calls);
    // Days 1–10; last 7 are 4–10
    expect(r.trend[0].day).toBe("2026-01-04");
    expect(r.trend[6].day).toBe("2026-01-10");
  });

  it("multiple calls on same day produce one trend point with rounded avg", () => {
    const calls = [
      makeCall(60, "2026-01-01"),
      makeCall(80, "2026-01-01"),
    ];
    const r = computeQAStats(calls);
    expect(r.trend).toHaveLength(1);
    expect(r.trend[0].day).toBe("2026-01-01");
    expect(r.trend[0].avg).toBe(70);
  });

  it("single call → single trend point", () => {
    const r = computeQAStats([makeCall(75, "2026-03-15")]);
    expect(r.trend).toHaveLength(1);
    expect(r.trend[0]).toEqual({ day: "2026-03-15", avg: 75 });
  });
});
