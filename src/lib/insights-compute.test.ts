import { describe, it, expect } from "vitest";
import {
  computeFunnelStages,
  computeHeatmapGrid,
  computeLeaderboard,
  type FunnelCallRow,
  type FunnelApptRow,
  type FunnelLeadRow,
  type HeatmapCallRow,
  type LeaderboardAgentRow,
  type LeaderboardCallRow,
  type LeaderboardApptRow,
} from "./insights-compute";

// ─── Funnel ──────────────────────────────────────────────────────────────

describe("computeFunnelStages", () => {
  const baseCalls: FunnelCallRow[] = [
    { duration_seconds: 120, lead_score: 80,  intent_label: "high"   },
    { duration_seconds: 5,   lead_score: 20,  intent_label: "low"    },
    { duration_seconds: 60,  lead_score: 55,  intent_label: "medium" },
    { duration_seconds: 0,   lead_score: 10,  intent_label: "none"   },
    { duration_seconds: 200, lead_score: 50,  intent_label: "high"   },
  ];
  const baseAppts: FunnelApptRow[] = [
    { status: "Completed" },
    { status: "Scheduled" },
    { status: "Completed" },
  ];
  const baseLeads: FunnelLeadRow[] = [
    { status: "Queued"  },
    { status: "Pending" },
    { status: "Dialed"  },
    { status: "Queued"  },
  ];

  it("returns correct window_days", () => {
    const r = computeFunnelStages([], [], [], 14);
    expect(r.window_days).toBe(14);
  });

  it("always returns exactly 7 named stages", () => {
    const r = computeFunnelStages([], [], [], 30);
    expect(r.stages).toHaveLength(7);
    const names = r.stages.map((s) => s.name);
    expect(names).toEqual([
      "Queued", "Calls", "Connected", "Qualified", "High intent", "Booked", "Completed",
    ]);
  });

  it("all counts are 0 when no data", () => {
    const r = computeFunnelStages([], [], [], 30);
    r.stages.forEach((s) => expect(s.count).toBe(0));
  });

  it("counts Queued leads — Pending and Queued status only", () => {
    const r = computeFunnelStages([], [], baseLeads, 30);
    // 2× Queued + 1× Pending = 3; Dialed is not queued
    expect(r.stages.find((s) => s.name === "Queued")!.count).toBe(3);
  });

  it("counts total Calls correctly", () => {
    const r = computeFunnelStages(baseCalls, [], [], 30);
    expect(r.stages.find((s) => s.name === "Calls")!.count).toBe(5);
  });

  it("Connected: only calls with duration > 10s", () => {
    const r = computeFunnelStages(baseCalls, [], [], 30);
    // duration_seconds: 120, 5, 60, 0, 200 → >10: 120, 60, 200 = 3
    expect(r.stages.find((s) => s.name === "Connected")!.count).toBe(3);
  });

  it("Connected: call with duration exactly 10s is NOT connected (must be > 10)", () => {
    const calls: FunnelCallRow[] = [
      { duration_seconds: 10,  lead_score: 0 },
      { duration_seconds: 11,  lead_score: 0 },
    ];
    const r = computeFunnelStages(calls, [], [], 30);
    expect(r.stages.find((s) => s.name === "Connected")!.count).toBe(1);
  });

  it("Qualified: lead_score >= 50", () => {
    const r = computeFunnelStages(baseCalls, [], [], 30);
    // scores: 80, 20, 55, 10, 50 → ≥50: 80, 55, 50 = 3
    expect(r.stages.find((s) => s.name === "Qualified")!.count).toBe(3);
  });

  it("Qualified: score exactly 49 does NOT qualify", () => {
    const calls: FunnelCallRow[] = [
      { lead_score: 49, duration_seconds: 100 },
      { lead_score: 50, duration_seconds: 100 },
    ];
    const r = computeFunnelStages(calls, [], [], 30);
    expect(r.stages.find((s) => s.name === "Qualified")!.count).toBe(1);
  });

  it("High intent: only intent_label === 'high'", () => {
    const r = computeFunnelStages(baseCalls, [], [], 30);
    // 2× "high" in baseCalls
    expect(r.stages.find((s) => s.name === "High intent")!.count).toBe(2);
  });

  it("Booked: total appointment count regardless of status", () => {
    const r = computeFunnelStages([], baseAppts, [], 30);
    expect(r.stages.find((s) => s.name === "Booked")!.count).toBe(3);
  });

  it("Completed: only appointments with status 'Completed'", () => {
    const r = computeFunnelStages([], baseAppts, [], 30);
    expect(r.stages.find((s) => s.name === "Completed")!.count).toBe(2);
  });

  it("handles null / undefined lead_score gracefully (treated as 0)", () => {
    const calls: FunnelCallRow[] = [
      { duration_seconds: 30, lead_score: null },
      { duration_seconds: 30, lead_score: undefined },
    ];
    const r = computeFunnelStages(calls, [], [], 30);
    expect(r.stages.find((s) => s.name === "Qualified")!.count).toBe(0);
  });

  it("handles string lead_score (Supabase can return strings for numeric cols)", () => {
    const calls: FunnelCallRow[] = [
      { duration_seconds: 30, lead_score: "75" as any },
    ];
    const r = computeFunnelStages(calls, [], [], 30);
    expect(r.stages.find((s) => s.name === "Qualified")!.count).toBe(1);
  });
});

// ─── Heatmap ─────────────────────────────────────────────────────────────

describe("computeHeatmapGrid", () => {
  it("returns correct window_days", () => {
    const r = computeHeatmapGrid([], 7);
    expect(r.window_days).toBe(7);
  });

  it("always returns exactly 168 cells (7 weekdays × 24 hours)", () => {
    const r = computeHeatmapGrid([], 30);
    expect(r.grid).toHaveLength(168);
  });

  it("empty cells have count=0 and avg_score=0", () => {
    const r = computeHeatmapGrid([], 30);
    r.grid.forEach((cell) => {
      expect(cell.count).toBe(0);
      expect(cell.avg_score).toBe(0);
    });
  });

  it("weekday values cover exactly 0–6 and hour values cover exactly 0–23", () => {
    const r = computeHeatmapGrid([], 30);
    const weekdays = new Set(r.grid.map((c) => c.weekday));
    const hours = new Set(r.grid.map((c) => c.hour));
    expect([...weekdays].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(hours.size).toBe(24);
  });

  it("accumulates count per (weekday, hour) bucket correctly", () => {
    // 2026-01-07 00:00:00Z is a Wednesday (UTC weekday=3)
    const calls: HeatmapCallRow[] = [
      { created_at: "2026-01-07T08:00:00Z", lead_score: 60 },
      { created_at: "2026-01-07T08:30:00Z", lead_score: 80 },
      { created_at: "2026-01-07T15:00:00Z", lead_score: 40 },
    ];
    const r = computeHeatmapGrid(calls, 30);
    const wed8 = r.grid.find((c) => c.weekday === 3 && c.hour === 8)!;
    expect(wed8.count).toBe(2);
    expect(wed8.avg_score).toBe(70); // (60+80)/2
    const wed15 = r.grid.find((c) => c.weekday === 3 && c.hour === 15)!;
    expect(wed15.count).toBe(1);
    expect(wed15.avg_score).toBe(40);
  });

  it("avg_score is rounded to nearest integer", () => {
    // avg of 33 and 34 = 33.5 → rounds to 34
    const calls: HeatmapCallRow[] = [
      { created_at: "2026-01-07T10:00:00Z", lead_score: 33 },
      { created_at: "2026-01-07T10:00:00Z", lead_score: 34 },
    ];
    const r = computeHeatmapGrid(calls, 30);
    const cell = r.grid.find((c) => c.weekday === 3 && c.hour === 10)!;
    expect(cell.avg_score).toBe(34);
  });

  it("handles null lead_score (treated as 0)", () => {
    const calls: HeatmapCallRow[] = [
      { created_at: "2026-01-07T09:00:00Z", lead_score: null },
      { created_at: "2026-01-07T09:00:00Z", lead_score: 100 },
    ];
    const r = computeHeatmapGrid(calls, 30);
    const cell = r.grid.find((c) => c.weekday === 3 && c.hour === 9)!;
    expect(cell.count).toBe(2);
    expect(cell.avg_score).toBe(50);
  });

  it("Sunday = weekday 0, Saturday = weekday 6", () => {
    // 2026-01-04 is a Sunday UTC
    // 2026-01-10 is a Saturday UTC
    const calls: HeatmapCallRow[] = [
      { created_at: "2026-01-04T12:00:00Z", lead_score: 50 },
      { created_at: "2026-01-10T12:00:00Z", lead_score: 70 },
    ];
    const r = computeHeatmapGrid(calls, 30);
    expect(r.grid.find((c) => c.weekday === 0 && c.hour === 12)!.count).toBe(1);
    expect(r.grid.find((c) => c.weekday === 6 && c.hour === 12)!.count).toBe(1);
  });
});

// ─── Leaderboard ─────────────────────────────────────────────────────────

describe("computeLeaderboard", () => {
  const agentA: LeaderboardAgentRow = { id: "a1", name: "Alpha", archetype: "closer", role: "sales" };
  const agentB: LeaderboardAgentRow = { id: "a2", name: "Beta",  archetype: "support", role: "customer_service" };
  const agentC: LeaderboardAgentRow = { id: "a3", name: "Gamma", role: null };

  it("returns correct window_days", () => {
    const r = computeLeaderboard([], [], [], 30);
    expect(r.window_days).toBe(30);
  });

  it("returns one entry per agent even with no calls", () => {
    const r = computeLeaderboard([agentA, agentB], [], [], 30);
    expect(r.agents).toHaveLength(2);
  });

  it("agent with no calls has all zero metrics", () => {
    const r = computeLeaderboard([agentA], [], [], 30);
    const entry = r.agents[0];
    expect(entry.total_calls).toBe(0);
    expect(entry.qualified).toBe(0);
    expect(entry.avg_lead_score).toBe(0);
    expect(entry.minutes).toBe(0);
    expect(entry.cost).toBe(0);
    expect(entry.cost_per_qualified).toBe(0);
    expect(entry.conversion_rate).toBe(0);
  });

  it("defaults role to 'customer_service' when agent.role is null/undefined", () => {
    const r = computeLeaderboard([agentC], [], [], 30);
    expect(r.agents[0].role).toBe("customer_service");
  });

  it("counts total_calls per agent correctly", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 60, duration_seconds: 100, cost: 0.5 },
      { agent_id: "a1", lead_score: 40, duration_seconds: 50,  cost: 0.3 },
      { agent_id: "a2", lead_score: 80, duration_seconds: 200, cost: 1.0 },
    ];
    const r = computeLeaderboard([agentA, agentB], calls, [], 30);
    const a = r.agents.find((x) => x.agent_id === "a1")!;
    const b = r.agents.find((x) => x.agent_id === "a2")!;
    expect(a.total_calls).toBe(2);
    expect(b.total_calls).toBe(1);
  });

  it("qualified: lead_score >= 50", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 50, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 49, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 90, duration_seconds: 60, cost: 0 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].qualified).toBe(2);
  });

  it("high_intent: intent_label === 'high' only", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 80, intent_label: "high",   duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 70, intent_label: "medium", duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 60, intent_label: "high",   duration_seconds: 60, cost: 0 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].high_intent).toBe(2);
  });

  it("minutes: total duration in minutes, rounded", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 0, duration_seconds: 90,  cost: 0 },
      { agent_id: "a1", lead_score: 0, duration_seconds: 90,  cost: 0 },
      { agent_id: "a1", lead_score: 0, duration_seconds: 60,  cost: 0 },
    ];
    // total = 240 s = 4 min exactly
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].minutes).toBe(4);
  });

  it("minutes rounds fractional minutes", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 0, duration_seconds: 100, cost: 0 },
    ];
    // 100s / 60 = 1.67 → rounds to 2
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].minutes).toBe(2);
  });

  it("cost: sum of call costs, fixed to 2 decimal places", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 0, duration_seconds: 60, cost: 0.123 },
      { agent_id: "a1", lead_score: 0, duration_seconds: 60, cost: 0.456 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].cost).toBeCloseTo(0.58, 2);
  });

  it("cost accepts string cost values (Supabase numeric → string)", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 80, duration_seconds: 60, cost: "1.50" as any },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].cost).toBeCloseTo(1.5, 2);
  });

  it("avg_lead_score: mean across all calls, rounded", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 60, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 80, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 70, duration_seconds: 60, cost: 0 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].avg_lead_score).toBe(70);
  });

  it("cost_per_qualified is 0 when qualified = 0", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 10, duration_seconds: 60, cost: 2.0 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].cost_per_qualified).toBe(0);
  });

  it("cost_per_qualified = cost / qualified, fixed to 2 dp", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 80, duration_seconds: 60, cost: 3.0 },
      { agent_id: "a1", lead_score: 70, duration_seconds: 60, cost: 1.0 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].cost_per_qualified).toBe(2.0);
  });

  it("conversion_rate: qualified / total × 100, rounded, 0 when no calls", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 80, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 80, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 20, duration_seconds: 60, cost: 0 },
      { agent_id: "a1", lead_score: 20, duration_seconds: 60, cost: 0 },
    ];
    // 2/4 = 50%
    const r = computeLeaderboard([agentA], calls, [], 30);
    expect(r.agents[0].conversion_rate).toBe(50);
  });

  it("bookings: count of appointments for agent", () => {
    const appts: LeaderboardApptRow[] = [
      { agent_id: "a1" },
      { agent_id: "a1" },
      { agent_id: "a2" },
    ];
    const r = computeLeaderboard([agentA, agentB], [], appts, 30);
    expect(r.agents.find((x) => x.agent_id === "a1")!.bookings).toBe(2);
    expect(r.agents.find((x) => x.agent_id === "a2")!.bookings).toBe(1);
  });

  it("sorts descending by qualified count", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 80, duration_seconds: 60, cost: 0 },
      { agent_id: "a2", lead_score: 80, duration_seconds: 60, cost: 0 },
      { agent_id: "a2", lead_score: 80, duration_seconds: 60, cost: 0 },
    ];
    const r = computeLeaderboard([agentA, agentB], calls, [], 30);
    expect(r.agents[0].agent_id).toBe("a2"); // 2 qualified > 1 qualified
  });

  it("tiebreaker: higher avg_lead_score wins when qualified count is equal", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "a1", lead_score: 60, duration_seconds: 60, cost: 0 },
      { agent_id: "a2", lead_score: 90, duration_seconds: 60, cost: 0 },
    ];
    // Both have 1 qualified call; a2 has higher avg_lead_score
    const r = computeLeaderboard([agentA, agentB], calls, [], 30);
    expect(r.agents[0].agent_id).toBe("a2");
  });

  it("calls attributed to unknown agent_id don't appear in agent rows", () => {
    const calls: LeaderboardCallRow[] = [
      { agent_id: "ghost", lead_score: 99, duration_seconds: 300, cost: 5 },
    ];
    const r = computeLeaderboard([agentA], calls, [], 30);
    // agentA gets 0 calls; ghost call silently ignored (no matching agent)
    expect(r.agents[0].total_calls).toBe(0);
  });
});
