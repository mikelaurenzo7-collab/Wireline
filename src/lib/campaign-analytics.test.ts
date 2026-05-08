import { describe, it, expect } from "vitest";
import {
  computeOutcomeBreakdown,
  computeCallStats,
  callIdsFromLeads,
  MIN_ANSWERED_CALL_DURATION_SEC,
  type CampaignLeadRow,
  type CampaignCallRow,
} from "./campaign-analytics";

describe("computeOutcomeBreakdown", () => {
  it("returns zero total + empty outcomes for empty input", () => {
    expect(computeOutcomeBreakdown([])).toEqual({ total: 0, outcomes: [] });
  });

  it("groups by status and sorts by count desc", () => {
    const out = computeOutcomeBreakdown([
      { status: "Completed" },
      { status: "Failed" },
      { status: "Completed" },
      { status: "Completed" },
      { status: "Failed" },
      { status: "Queued" },
    ]);
    expect(out.total).toBe(6);
    expect(out.outcomes.map(o => o.status)).toEqual(["Completed", "Failed", "Queued"]);
    expect(out.outcomes[0]).toEqual({ status: "Completed", count: 3, pct: 50 });
    expect(out.outcomes[1]).toEqual({ status: "Failed", count: 2, pct: 33 });  // 33.33 → 33
    expect(out.outcomes[2]).toEqual({ status: "Queued", count: 1, pct: 17 });   // 16.67 → 17
  });

  it("falls back to 'unknown' for null/undefined status", () => {
    const out = computeOutcomeBreakdown([
      { status: null },
      { status: undefined as any },
      { status: "" },  // empty string also goes to unknown via ||
    ]);
    expect(out.outcomes[0].status).toBe("unknown");
    expect(out.outcomes[0].count).toBe(3);
  });

  it("pct rounds to nearest int and may not sum to exactly 100", () => {
    const out = computeOutcomeBreakdown([
      { status: "A" }, { status: "A" }, { status: "A" },  // 3 of 7 = 42.86 → 43
      { status: "B" }, { status: "B" },                    // 2 of 7 = 28.57 → 29
      { status: "C" }, { status: "C" },                    // 2 of 7 = 28.57 → 29
    ]);
    const sum = out.outcomes.reduce((s, o) => s + o.pct, 0);
    expect(sum).toBe(101);  // documented rounding behaviour
  });
});

describe("computeCallStats", () => {
  it("returns zeros for empty input (no NaN)", () => {
    expect(computeCallStats([])).toEqual({
      answered: 0, avg_duration_sec: 0, total_cost_usd: 0, avg_lead_score: 0,
    });
  });

  it("filters answered = duration STRICTLY greater than threshold", () => {
    const rows: CampaignCallRow[] = [
      { duration_seconds: MIN_ANSWERED_CALL_DURATION_SEC, cost_usd: 0 },      // not answered (boundary)
      { duration_seconds: MIN_ANSWERED_CALL_DURATION_SEC + 1, cost_usd: 0 }, // answered
      { duration_seconds: 60, cost_usd: 0 },                                  // answered
      { duration_seconds: null, cost_usd: 0 },                                // not answered (null = 0)
    ];
    const stats = computeCallStats(rows);
    expect(stats.answered).toBe(2);
    expect(stats.avg_duration_sec).toBe(33);  // (6 + 60) / 2 = 33
  });

  it("totals cost over ALL rows including unanswered (voicemail still costs)", () => {
    const stats = computeCallStats([
      { duration_seconds: 1, cost_usd: 0.05 },     // not answered, still cost
      { duration_seconds: 60, cost_usd: 0.15 },    // answered
    ]);
    expect(stats.total_cost_usd).toBe(0.20);
  });

  it("rounds total_cost_usd to 4 decimals", () => {
    const stats = computeCallStats([
      { duration_seconds: 60, cost_usd: 0.001234567 },
    ]);
    expect(stats.total_cost_usd).toBe(0.0012);
  });

  it("coerces string-form cost (Postgres NUMERIC quirk)", () => {
    const stats = computeCallStats([
      { duration_seconds: 60, cost_usd: "0.5" as any },
    ]);
    expect(stats.total_cost_usd).toBe(0.5);
  });

  it("avg_lead_score runs over rows with non-null score (0 counts)", () => {
    const stats = computeCallStats([
      { duration_seconds: 60, cost_usd: 0, lead_score: 0 },     // counted
      { duration_seconds: 60, cost_usd: 0, lead_score: 100 },   // counted
      { duration_seconds: 60, cost_usd: 0, lead_score: null },  // not counted
    ]);
    expect(stats.avg_lead_score).toBe(50);  // (0 + 100) / 2 = 50
  });

  it("returns 0 avg_lead_score when no rows are scored", () => {
    const stats = computeCallStats([
      { duration_seconds: 60, cost_usd: 0, lead_score: null },
    ]);
    expect(stats.avg_lead_score).toBe(0);
  });

  it("honours a custom minAnsweredSec threshold", () => {
    const stats = computeCallStats(
      [
        { duration_seconds: 5, cost_usd: 0 },
        { duration_seconds: 12, cost_usd: 0 },
      ],
      { minAnsweredSec: 10 },
    );
    expect(stats.answered).toBe(1);
  });
});

describe("callIdsFromLeads", () => {
  it("returns only the call_ids that are non-null", () => {
    const ids = callIdsFromLeads([
      { call_id: "c1" },
      { call_id: null },
      { call_id: "c2" },
      { call_id: undefined },
    ] as CampaignLeadRow[]);
    expect(ids).toEqual(["c1", "c2"]);
  });

  it("returns [] when no leads have a call_id", () => {
    expect(callIdsFromLeads([{}, { status: "Queued" }])).toEqual([]);
  });
});
