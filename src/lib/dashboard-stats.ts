// ────────────────────────────────────────────────────────────────────────
//  Dashboard stats math.
//
//  The /api/dashboard/stats endpoint runs ~80 lines of derivations on
//  the parallel-fetched rows: totals, sentiment counts, week-over-week
//  deltas, the 7-day chart series, and the hot-lead merge. Extracted
//  here so each derivation is unit-testable and the route handler can
//  go from "compute and serialize" to "compute and serialize" with the
//  compute behind a single call.
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface CallLogRow {
  id: string;
  cost?: number | string | null;
  duration_seconds?: number | null;
  direction?: string | null;
  created_at: string;
  lead_score?: number | null;
  intent_label?: string | null;
  summary?: string | null;
  customer_number?: string | null;
  sentiment?: string | null;
}

export interface EmailThreadRow {
  id: string;
  customer_email?: string | null;
  lead_score?: number | null;
  intent_label?: string | null;
  summary?: string | null;
  created_at: string;
}

export interface ApptRow { created_at: string }

export interface DashboardStatsInput {
  totalAppointments: number;
  totalLeads: number;
  logs: CallLogRow[];           // current 7 days (or whatever the route fetches)
  prevLogs: CallLogRow[];        // prior period of equal length
  hotEmails: EmailThreadRow[];
  recentAppts: ApptRow[];
  /** Anchor date for "today" — injected for testability. Defaults to Date.now(). */
  now?: number;
}

export interface DashboardStatsResult {
  totalAppointments: number;
  totalLeads: number;
  totalCalls: number;
  totalMinutes: number;
  totalCost: string;             // formatted with .toFixed(2)
  inboundCount: number;
  outboundCount: number;
  conversionRate: string | number;
  avgLeadScore: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  week_delta: {
    calls_pct: number | null;
    cost_pct:  number | null;
    score_pct: number | null;
  };
  hotLeads: Array<{
    id: string;
    type: 'call' | 'email';
    contact: string | null;
    score: number;
    intent: string | null;
    summary: string | null;
    date: string;
  }>;
  chartData: Array<{ name: string; signals: number; leads: number }>;
}

/**
 * Returns null when there's no baseline. The dashboard renders '—'
 * rather than a misleading 100% in that case.
 */
function pctOrNull(curr: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  if (!Number.isFinite(curr)) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function asNumber(input: unknown): number {
  const n = typeof input === 'number' ? input : Number(input);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 7-day weekday-anchored chart series. Returned as an array of
 * { name (e.g. "Mon"), signals, leads } in chronological order, oldest
 * first. Buckets are aligned to UTC midnight of `now` minus N days so
 * the result is deterministic across timezones for a given input.
 */
export function buildSevenDayChart(
  logs: CallLogRow[],
  recentAppts: ApptRow[],
  now: number = Date.now(),
): Array<{ name: string; signals: number; leads: number }> {
  const days = 7;
  const todayUTC = new Date(now);
  // Anchor at UTC midnight of "today" so bucket math is timezone-stable.
  const _todayKey = todayUTC.toISOString().slice(0, 10);
  const last7Days: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    last7Days.push(d.toISOString().slice(0, 10));
  }
  const map: Record<string, { signals: number; leads: number }> = {};
  for (const k of last7Days) map[k] = { signals: 0, leads: 0 };

  for (const l of logs ?? []) {
    const t = Date.parse(l.created_at);
    if (!Number.isFinite(t)) continue;
    const k = new Date(t).toISOString().slice(0, 10);
    if (map[k]) map[k].signals += 1;
  }
  for (const a of recentAppts ?? []) {
    const t = Date.parse(a.created_at);
    if (!Number.isFinite(t)) continue;
    const k = new Date(t).toISOString().slice(0, 10);
    if (map[k]) map[k].leads += 1;
  }
  return last7Days.map(dateStr => {
    const date = new Date(dateStr + 'T12:00:00Z');
    return {
      name: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      signals: map[dateStr].signals,
      leads:   map[dateStr].leads,
    };
  });
}

/**
 * Sentiment breakdown — every call logged is bucketed into one of the
 * three buckets. Unknown / missing sentiment counts as "neutral" so the
 * three numbers always sum to logs.length.
 */
export function buildSentimentBreakdown(logs: CallLogRow[]) {
  const out = { positive: 0, neutral: 0, negative: 0 };
  for (const l of logs ?? []) {
    const s = (l.sentiment || 'neutral').toLowerCase();
    if (s === 'positive') out.positive++;
    else if (s === 'negative') out.negative++;
    else out.neutral++;
  }
  return out;
}

/**
 * Hot-lead merge: high-score calls + high-score email threads, sorted
 * by recency, capped at 5. The dashboard's "hot leads" widget pulls
 * straight from this.
 */
export function buildHotLeads(
  logs: CallLogRow[],
  hotEmails: EmailThreadRow[],
): DashboardStatsResult['hotLeads'] {
  const hotCalls = (logs ?? [])
    .filter(l => (l.lead_score ?? 0) >= 75)
    .slice(0, 5)
    .map(c => ({
      id: c.id,
      type: 'call' as const,
      contact: c.customer_number ?? null,
      score: Math.round(c.lead_score ?? 0),
      intent: c.intent_label ?? null,
      summary: c.summary ?? null,
      date: c.created_at,
    }));
  const emails = (hotEmails ?? []).map(e => ({
    id: e.id,
    type: 'email' as const,
    contact: e.customer_email ?? null,
    score: Math.round(e.lead_score ?? 0),
    intent: e.intent_label ?? null,
    summary: e.summary ?? null,
    date: e.created_at,
  }));
  return [...hotCalls, ...emails]
    .sort((a, b) => {
      const ta = Date.parse(a.date) || 0;
      const tb = Date.parse(b.date) || 0;
      return tb - ta;
    })
    .slice(0, 5);
}

export function computeDashboardStats(input: DashboardStatsInput): DashboardStatsResult {
  const logs    = input.logs ?? [];
  const prev    = input.prevLogs ?? [];
  const appts   = input.recentAppts ?? [];
  const hotEm   = input.hotEmails ?? [];
  const now     = input.now ?? Date.now();

  const totalCalls   = logs.length;
  const totalMinutes = Math.ceil(logs.reduce((s, l) => s + (l.duration_seconds || 0), 0) / 60);
  const totalCost    = logs.reduce((s, l) => s + asNumber(l.cost), 0);
  const inboundCount  = logs.filter(l => l.direction === 'inbound').length;
  const outboundCount = logs.filter(l => l.direction === 'outbound').length;

  const scored = logs.filter(l => (l.lead_score ?? 0) > 0);
  const avgLeadScore = scored.length > 0
    ? Math.round(scored.reduce((s, l) => s + (l.lead_score || 0), 0) / scored.length)
    : 0;

  const sentimentBreakdown = buildSentimentBreakdown(logs);

  const prevCost = prev.reduce((s, l) => s + asNumber(l.cost), 0);
  const prevScored = prev.filter(l => (l.lead_score ?? 0) > 0);
  const prevAvgScore = prevScored.length > 0
    ? Math.round(prevScored.reduce((s, l) => s + (l.lead_score || 0), 0) / prevScored.length)
    : 0;

  const week_delta = {
    calls_pct: pctOrNull(totalCalls, prev.length),
    cost_pct:  pctOrNull(totalCost,  prevCost),
    score_pct: pctOrNull(avgLeadScore, prevAvgScore),
  };

  const conversionRate = totalCalls > 0
    ? ((input.totalAppointments / totalCalls) * 100).toFixed(1)
    : 0;

  return {
    totalAppointments: input.totalAppointments,
    totalLeads:        input.totalLeads,
    totalCalls,
    totalMinutes,
    totalCost: totalCost.toFixed(2),
    inboundCount,
    outboundCount,
    conversionRate,
    avgLeadScore,
    sentimentBreakdown,
    week_delta,
    hotLeads: buildHotLeads(logs, hotEm),
    chartData: buildSevenDayChart(logs, appts, now),
  };
}
