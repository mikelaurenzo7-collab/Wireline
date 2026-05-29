// ────────────────────────────────────────────────────────────────────────
//  Agent performance math.
//
//  /api/agents/:id/performance returns the per-agent rollup the
//  AgentTraining + FleetSettings panels render: total calls, minutes,
//  average lead score, sentiment breakdown, and a 7-day sparkline.
//  Previously inline in server.ts (~25 lines of derivation that ran on
//  every panel mount). Extracted here as a pure tested module so the
//  route handler shrinks to "ownership + DB read + helper call" and
//  the math is locked in by tests.
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface AgentCallLogRow {
  duration_seconds?: number | null;
  durationSeconds?: number | null;
  lead_score?: number | null;
  leadScore?: number | null;
  sentiment?: string | null;
  created_at?: string;
  createdAt?: string | Date;
}

export type SentimentBreakdown = { positive: number; neutral: number; negative: number };

export interface AgentPerformance {
  callCount: number;
  totalMinutes: number;
  avgScore: number;
  sentiment: SentimentBreakdown;
  /** Calls per day, oldest-first, length matches `windowDays` (default 7). */
  sparkline: number[];
}

const DEFAULT_WINDOW_DAYS = 7;

// Map raw sentiment strings to one of three buckets. Anything we don't
// recognise (including null/undefined) counts as neutral so the buckets
// always sum to callCount.
function bucketSentiment(raw: string | null | undefined): keyof SentimentBreakdown {
  const k = (raw || "neutral").toLowerCase();
  if (k === "positive" || k === "negative" || k === "neutral") return k;
  return "neutral";
}

// YYYY-MM-DD key in UTC. Returning null for non-finite timestamps lets
// the caller skip junk created_at rows without poisoning the sparkline.
function utcDayKey(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().split("T")[0];
}

export function computeAgentPerformance(input: {
  rows: AgentCallLogRow[];
  /** Treated as "today" for sparkline windowing. Default: now. */
  now?: Date;
  /** How many days the sparkline spans. Default 7. */
  windowDays?: number;
}): AgentPerformance {
  const rows = input.rows;
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;

  const callCount = rows.length;
  const totalMinutes = Math.ceil(
    rows.reduce((s, r) => s + (r.duration_seconds ?? r.durationSeconds ?? 0), 0) / 60,
  );

  // Average lead score is taken over rows that actually got scored —
  // a zero or null score should not drag the average down.
  const scored = rows.filter((r) => (r.lead_score ?? r.leadScore ?? 0) > 0);
  const avgScore = scored.length
    ? Math.round(
        scored.reduce((s, r) => s + ((r.lead_score ?? r.leadScore) as number), 0) / scored.length,
      )
    : 0;

  const sentiment: SentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) sentiment[bucketSentiment(r.sentiment)]++;

  // Build the windowed day-list oldest-first so the sparkline reads
  // left-to-right as time progresses. Anchored on `now` so tests can
  // pin the window deterministically.
  const last = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - (windowDays - 1 - i));
    return d.toISOString().split("T")[0];
  });
  const byDay: Record<string, number> = {};
  for (const d of last) byDay[d] = 0;
  for (const r of rows) {
    const k = utcDayKey(
      r.created_at ??
        (typeof r.createdAt === "string"
          ? r.createdAt
          : r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : ""),
    );
    if (k && k in byDay) byDay[k]++;
  }
  const sparkline = last.map((d) => byDay[d]);

  return { callCount, totalMinutes, avgScore, sentiment, sparkline };
}

/** Empty rollup, used by the route handler's catch-all so the UI always
 *  receives a well-formed response shape even when a DB read fails. */
export function emptyAgentPerformance(windowDays = DEFAULT_WINDOW_DAYS): AgentPerformance {
  return {
    callCount: 0,
    totalMinutes: 0,
    avgScore: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    sparkline: Array.from({ length: windowDays }, () => 0),
  };
}
