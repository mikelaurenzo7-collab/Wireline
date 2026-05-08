// ────────────────────────────────────────────────────────────────────────
//  QA stats computation.
//
//  GET /api/qa/stats runs over every scored call in the requested window
//  and produces:
//    - total count + average score
//    - 5-bucket score distribution (Poor → Excellent)
//    - per-dimension averages (greeting, discovery, solution, objection, closing)
//    - 7-point daily score trend (last 7 days with data)
//
//  The inline math lived in server.ts with no test coverage. Wrong
//  distribution numbers or dimension averages give operators misleading
//  coaching signals, so every edge is now tested separately.
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface QACallRow {
  qa_score?: number | null;
  qa_breakdown?: QABreakdown | null | Record<string, unknown>;
  created_at: string;
}

export interface QABreakdown {
  greeting?: number | null;
  discovery?: number | null;
  solution?: number | null;
  objection?: number | null;
  closing?: number | null;
  [key: string]: unknown;
}

export interface DistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  color: string;
}

export interface DimensionAverages {
  greeting: number;
  discovery: number;
  solution: number;
  objection: number;
  closing: number;
}

export interface TrendPoint {
  day: string;   // ISO date "YYYY-MM-DD"
  avg: number;   // rounded integer average QA score for that day
}

export interface QAStatsResult {
  count: number;
  avgScore: number;
  distribution: DistributionBucket[];
  dimensions: DimensionAverages;
  trend: TrendPoint[];
}

const QA_DIMENSIONS = ["greeting", "discovery", "solution", "objection", "closing"] as const;

const EMPTY_DIMENSIONS: DimensionAverages = {
  greeting: 0,
  discovery: 0,
  solution: 0,
  objection: 0,
  closing: 0,
};

const DISTRIBUTION_TEMPLATE: Omit<DistributionBucket, "count">[] = [
  { label: "Poor (0–39)",     min: 0,  max: 39,  color: "#FF6BD9" },
  { label: "Fair (40–59)",    min: 40, max: 59,  color: "#FF9A5C" },
  { label: "Good (60–74)",    min: 60, max: 74,  color: "#FFD166" },
  { label: "Great (75–89)",   min: 75, max: 89,  color: "#4DFFC4" },
  { label: "Excellent (90+)", min: 90, max: 100, color: "#7DF9FF" },
];

const num = (n: unknown): number => {
  const v = typeof n === "string" ? parseFloat(n as string) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Compute aggregate QA stats from a list of scored call rows.
 *
 * If `calls` is empty, returns the zero-value result shape so callers
 * never have to guard against undefined.
 *
 * The `trend` field holds the last 7 days that have at least one scored
 * call, sorted ascending by date.
 */
export function computeQAStats(calls: QACallRow[]): QAStatsResult {
  if (calls.length === 0) {
    return {
      count: 0,
      avgScore: 0,
      distribution: DISTRIBUTION_TEMPLATE.map((t) => ({ ...t, count: 0 })),
      dimensions: { ...EMPTY_DIMENSIONS },
      trend: [],
    };
  }

  // ── average score ──────────────────────────────────────────────────────
  const total = calls.length;
  const scoreSum = calls.reduce((s, c) => s + num(c.qa_score), 0);
  const avgScore = Math.round(scoreSum / total);

  // ── distribution ───────────────────────────────────────────────────────
  const distribution: DistributionBucket[] = DISTRIBUTION_TEMPLATE.map((t) => ({
    ...t,
    count: calls.filter(
      (c) => num(c.qa_score) >= t.min && num(c.qa_score) <= t.max,
    ).length,
  }));

  // ── dimension averages ─────────────────────────────────────────────────
  const dimSums = { greeting: 0, discovery: 0, solution: 0, objection: 0, closing: 0 };
  let dimCount = 0;

  for (const c of calls) {
    if (c.qa_breakdown && typeof c.qa_breakdown === "object") {
      const bd = c.qa_breakdown as QABreakdown;
      for (const dim of QA_DIMENSIONS) {
        dimSums[dim] += num(bd[dim]);
      }
      dimCount++;
    }
  }

  const dimensions: DimensionAverages =
    dimCount > 0
      ? {
          greeting:  Number((dimSums.greeting  / dimCount).toFixed(1)),
          discovery: Number((dimSums.discovery / dimCount).toFixed(1)),
          solution:  Number((dimSums.solution  / dimCount).toFixed(1)),
          objection: Number((dimSums.objection / dimCount).toFixed(1)),
          closing:   Number((dimSums.closing   / dimCount).toFixed(1)),
        }
      : { ...EMPTY_DIMENSIONS };

  // ── trend ──────────────────────────────────────────────────────────────
  const byDay = new Map<string, number[]>();
  for (const c of calls) {
    const day = c.created_at.slice(0, 10);
    const bucket = byDay.get(day) ?? [];
    bucket.push(num(c.qa_score));
    byDay.set(day, bucket);
  }

  const trend: TrendPoint[] = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([day, scores]) => ({
      day,
      avg: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length),
    }));

  return { count: total, avgScore, distribution, dimensions, trend };
}
