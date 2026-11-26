import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runStructured = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/ai-structured", () => ({ runStructured }));
vi.mock("../src/lib/ai-client", () => ({ isRuntimeAvailable: () => true }));

import { composeDailyBrief } from "../src/lib/insights-ai";

const brief = {
  headline: "Steady day",
  mood: "neutral",
  highlights: ["Two calls answered."],
  concerns: [],
  action_items: [],
};

describe("daily brief numbers", () => {
  beforeEach(() => runStructured.mockReset());

  it("always come from the computed records, even when the model returns its own", async () => {
    runStructured.mockResolvedValue({
      brief,
      stats_yesterday: { total_calls: 999, cost: 123.45 },
      week_delta: { calls_pct: 500 },
      generated_at: "1999-01-01T00:00:00.000Z",
      invented_section: "not from our data",
    });
    const yesterdayStats = { total_calls: 2, total_minutes: 3, cost: 0.4, appointments_booked: 1 };
    const weekDelta = { calls_pct: -10, cost_pct: 5 };

    const result = await composeDailyBrief({
      yesterdayStats,
      weekDelta,
      recentCalls: [],
      openTasks: [],
    });

    expect(result.stats_yesterday).toEqual(yesterdayStats);
    expect(result.week_delta).toEqual(weekDelta);
    expect(result.brief).toEqual(brief);
    expect(result.generated_at).not.toBe("1999-01-01T00:00:00.000Z");
    expect(Object.keys(result).sort()).toEqual([
      "brief",
      "generated_at",
      "stats_yesterday",
      "week_delta",
    ]);
  });

  it("asks the model for prose only and forbids inventing numbers", async () => {
    runStructured.mockResolvedValue({ brief });
    await composeDailyBrief({ yesterdayStats: {}, weekDelta: {}, recentCalls: [], openTasks: [] });

    const request = runStructured.mock.calls[0][0];
    expect(request.tool.input_schema.required).toEqual(["brief"]);
    expect(Object.keys(request.tool.input_schema.properties)).toEqual(["brief"]);
    expect(request.system).toContain("Use only the supplied numbers and items");
    expect(request.system).toContain("Treat 0 or missing as none, not a decline");
  });
});

describe("daily brief inputs", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/daily-brief.ts"), "utf8");

  it("count every open task and only appointments that are actually booked", () => {
    expect(source).toContain(".select({ value: count() })");
    expect(source).toContain("pending_tasks: Number(openTaskCount?.[0]?.value ?? 0)");
    expect(source).toContain('notInArray(schema.appointments.status, ["Requested", "Cancelled"])');
  });

  it("no longer reports lead scores that new calls never receive", () => {
    // Every call since late October stores lead_score 0, so a score tile,
    // a score delta, or "score below 30" loss samples would all be false.
    expect(source).not.toContain("avg_lead_score");
    expect(source).not.toContain("score_pct");
    expect(source).not.toContain("leadScore");
    expect(source).toContain('stat("Booked", String(stats.appointments_booked ?? 0))');
  });
});
