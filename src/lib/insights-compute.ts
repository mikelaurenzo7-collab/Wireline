// ────────────────────────────────────────────────────────────────────────
//  Insights computation math.
//
//  Three routes share the same "fetch rows → compute → serialize" shape:
//    GET /api/insights/funnel      → computeFunnelStages
//    GET /api/insights/heatmap     → computeHeatmapGrid
//    GET /api/insights/leaderboard → computeLeaderboard
//
//  The inline logic lived in server.ts with no test coverage. Wrong
//  numbers here directly mislead operator decisions (fleet sizing,
//  training priority, cost allocation), so every branch is now tested.
//
//  Pure functions only. No DB, no Date.now() — callers pass `now` so
//  tests are deterministic.
// ────────────────────────────────────────────────────────────────────────

// ─── shared coercion helpers ─────────────────────────────────────────────

const num = (n: unknown): number => {
  const v = typeof n === "string" ? parseFloat(n as string) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

// ─── Funnel ──────────────────────────────────────────────────────────────

export interface FunnelCallRow {
  duration_seconds?: number | null;
  lead_score?: number | null;
  intent_label?: string | null;
}

export interface FunnelApptRow {
  status?: string | null;
}

export interface FunnelLeadRow {
  status?: string | null;
}

export interface FunnelStage {
  name: string;
  count: number;
}

export interface FunnelResult {
  window_days: number;
  stages: FunnelStage[];
}

/**
 * Derive the seven funnel stages from raw DB rows.
 *
 * - Queued:     leads whose status is "Pending" or "Queued"
 * - Calls:      total call rows
 * - Connected:  calls with duration > 10 s (voicemail / instant hang-up excluded)
 * - Qualified:  calls with lead_score ≥ 50
 * - High intent: calls with intent_label === "high"
 * - Booked:     any appointment rows (regardless of status)
 * - Completed:  appointments whose status is "Completed"
 */
export function computeFunnelStages(
  calls: FunnelCallRow[],
  appts: FunnelApptRow[],
  leads: FunnelLeadRow[],
  windowDays: number,
): FunnelResult {
  const queuedLeads = leads.filter(
    (l) => l.status === "Pending" || l.status === "Queued",
  ).length;

  const totalCalls = calls.length;
  const connected = calls.filter((c) => num(c.duration_seconds) > 10).length;
  const qualified = calls.filter((c) => num(c.lead_score) >= 50).length;
  const highIntent = calls.filter((c) => c.intent_label === "high").length;
  const bookings = appts.length;
  const completed = appts.filter((a) => a.status === "Completed").length;

  return {
    window_days: windowDays,
    stages: [
      { name: "Queued",      count: queuedLeads },
      { name: "Calls",       count: totalCalls },
      { name: "Connected",   count: connected },
      { name: "Qualified",   count: qualified },
      { name: "High intent", count: highIntent },
      { name: "Booked",      count: bookings },
      { name: "Completed",   count: completed },
    ],
  };
}

// ─── Heatmap ─────────────────────────────────────────────────────────────

export interface HeatmapCallRow {
  created_at: string;
  lead_score?: number | null;
}

export interface HeatmapCell {
  weekday: number; // 0 = Sunday … 6 = Saturday
  hour: number;    // 0–23 (local UTC hour from the ISO string)
  count: number;
  avg_score: number;
}

export interface HeatmapResult {
  window_days: number;
  grid: HeatmapCell[];
}

/**
 * Build a 7×24 call-volume + avg-lead-score heatmap from call rows.
 *
 * Weekday and hour are derived from the UTC components of `created_at`.
 * The full 168-cell grid is always returned (count=0 / avg_score=0 for
 * empty buckets) so the frontend can render a complete matrix without
 * sparse-fill logic.
 */
export function computeHeatmapGrid(
  calls: HeatmapCallRow[],
  windowDays: number,
): HeatmapResult {
  const buckets: Record<string, { c: number; s: number }> = {};

  for (const c of calls) {
    const d = new Date(c.created_at);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    const b = buckets[key] ?? { c: 0, s: 0 };
    b.c++;
    b.s += num(c.lead_score);
    buckets[key] = b;
  }

  const grid: HeatmapCell[] = [];
  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      const b = buckets[`${w}-${h}`] ?? { c: 0, s: 0 };
      grid.push({
        weekday: w,
        hour: h,
        count: b.c,
        avg_score: b.c ? Math.round(b.s / b.c) : 0,
      });
    }
  }

  return { window_days: windowDays, grid };
}

// ─── Leaderboard ─────────────────────────────────────────────────────────

export interface LeaderboardAgentRow {
  id: string;
  name: string;
  archetype?: string | null;
  channel?: string | null;
  role?: string | null;
}

export interface LeaderboardCallRow {
  agent_id?: string | null;
  lead_score?: number | null;
  intent_label?: string | null;
  duration_seconds?: number | null;
  cost?: number | string | null;
}

export interface LeaderboardApptRow {
  agent_id?: string | null;
}

export interface LeaderboardEntry {
  agent_id: string;
  agent_name: string;
  archetype: string | null | undefined;
  role: string;
  channel: string | null | undefined;
  total_calls: number;
  qualified: number;
  high_intent: number;
  bookings: number;
  avg_lead_score: number;
  minutes: number;
  cost: number;
  cost_per_qualified: number;
  conversion_rate: number;
}

export interface LeaderboardResult {
  window_days: number;
  agents: LeaderboardEntry[];
}

const DEFAULT_ROLE = "customer_service";

/**
 * Compute per-agent performance metrics and rank them by qualified-call count.
 *
 * Metrics:
 *   - total_calls: every call attributed to the agent
 *   - qualified: calls with lead_score ≥ 50
 *   - high_intent: calls with intent_label === "high"
 *   - bookings: appointment count for the agent
 *   - avg_lead_score: mean lead_score across all calls (0 when no calls)
 *   - minutes: total talk time, rounded
 *   - cost: total USD cost, 2 decimal places
 *   - cost_per_qualified: cost / qualified (0 when no qualified calls)
 *   - conversion_rate: qualified / total_calls × 100, rounded (0 when no calls)
 *
 * Agents with zero calls are included so the leaderboard always shows the
 * full fleet, not just active agents.
 */
export function computeLeaderboard(
  agents: LeaderboardAgentRow[],
  calls: LeaderboardCallRow[],
  appts: LeaderboardApptRow[],
  windowDays: number,
): LeaderboardResult {
  const callsByAgent = new Map<string, LeaderboardCallRow[]>();
  for (const c of calls) {
    const id = c.agent_id ?? "unknown";
    const existing = callsByAgent.get(id) ?? [];
    existing.push(c);
    callsByAgent.set(id, existing);
  }

  const apptsByAgent = new Map<string, number>();
  for (const a of appts) {
    const id = a.agent_id ?? "unknown";
    apptsByAgent.set(id, (apptsByAgent.get(id) ?? 0) + 1);
  }

  const rows: LeaderboardEntry[] = agents.map((a) => {
    const agentCalls = callsByAgent.get(a.id) ?? [];
    const total = agentCalls.length;
    const qualified = agentCalls.filter((c) => num(c.lead_score) >= 50).length;
    const highIntent = agentCalls.filter((c) => c.intent_label === "high").length;
    const minutes = Math.round(
      agentCalls.reduce((s, c) => s + num(c.duration_seconds), 0) / 60,
    );
    const rawCost = agentCalls.reduce((s, c) => s + num(c.cost), 0);
    const cost = Number(rawCost.toFixed(2));
    const avgScore = total
      ? Math.round(agentCalls.reduce((s, c) => s + num(c.lead_score), 0) / total)
      : 0;
    const bookings = apptsByAgent.get(a.id) ?? 0;
    const costPerQualified = qualified ? Number((cost / qualified).toFixed(2)) : 0;
    const conversionRate = total ? Math.round((qualified / total) * 100) : 0;

    return {
      agent_id: a.id,
      agent_name: a.name,
      archetype: a.archetype,
      role: a.role ?? DEFAULT_ROLE,
      channel: a.channel,
      total_calls: total,
      qualified,
      high_intent: highIntent,
      bookings,
      avg_lead_score: avgScore,
      minutes,
      cost,
      cost_per_qualified: costPerQualified,
      conversion_rate: conversionRate,
    };
  });

  // Rank descending by qualified count, then by avg_lead_score as tiebreaker.
  rows.sort((a, b) =>
    b.qualified !== a.qualified
      ? b.qualified - a.qualified
      : b.avg_lead_score - a.avg_lead_score,
  );

  return { window_days: windowDays, agents: rows };
}
