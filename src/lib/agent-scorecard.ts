// ────────────────────────────────────────────────────────────────────────
//  Agent scorecard math.
//
//  Extracted from server.ts so the outcome-aligned metric for each
//  kpi_focus is a unit-testable pure function. Misreporting a
//  conversion rate or first-call resolution is the kind of subtle bug
//  that quietly mis-steers account holders for weeks before anyone notices,
//  so this module gets dense test coverage.
//
//  No I/O. The route handler does the queries and feeds them in;
//  whatever rows it found go through computeScorecard() to produce
//  the response body.
// ────────────────────────────────────────────────────────────────────────

export type KpiFocus =
  | "general"
  | "conversions"
  | "qualifications"
  | "resolutions"
  | "satisfaction";

export interface CallLogRow {
  id: string;
  lead_score?: number | null;
  leadScore?: number | null;
  duration_seconds?: number | null;
  durationSeconds?: number | null;
  sentiment?: string | null;
  intent_label?: string | null;
  intentLabel?: string | null;
  created_at?: string;
  createdAt?: string | Date;
}

export interface AppointmentRow {
  id: string;
  created_at?: string;
  createdAt?: string | Date;
}
export interface FollowUpTaskRow {
  id: string;
  source_id?: string | null;
  sourceId?: string | null;
  source_type?: string | null;
  sourceType?: string | null;
  created_at?: string;
  createdAt?: string | Date;
}

export interface ScorecardInput {
  focus: KpiFocus | string;
  windowDays: number; // current period length in days
  now: number; // ms since epoch — injected for testability
  currentLogs: CallLogRow[];
  priorLogs: CallLogRow[]; // same-length window immediately before
  appointments: AppointmentRow[];
  openFollowUps: FollowUpTaskRow[];
}

export interface PrimaryMetric {
  label: string;
  value: number;
  format: "percent" | "number" | "seconds" | "score";
  delta_pct: number;
  trend: number[];
}
export interface SecondaryMetric {
  label: string;
  value: number;
  format: "number" | "seconds" | "score" | "percent";
}

export interface ScorecardResult {
  kpi_focus: KpiFocus | string;
  window_days: number;
  primary: PrimaryMetric;
  secondary: SecondaryMetric[];
  sample_size: number;
}

export function pctDelta(current: number, prior: number): number {
  // Symmetric guard: if prior is 0 we don't have a baseline; report a
  // positive delta only if current is non-zero so dashboards don't spin
  // green-arrow forever for a brand-new agent.
  if (!Number.isFinite(prior) || prior === 0) return current > 0 ? 100 : 0;
  if (!Number.isFinite(current)) return 0;
  return Math.round(((current - prior) / prior) * 100);
}

/**
 * Bucketed daily count over the window. The trend is rendered as a
 * sparkline; bucket count is capped at 60 so a year-long window doesn't
 * produce a 365-element array.
 */
export function buildTrend(logs: CallLogRow[], now: number, windowDays: number): number[] {
  const buckets = Math.max(1, Math.min(windowDays, 60) | 0);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const bucketMs = windowMs / buckets;
  const trend = Array(buckets).fill(0) as number[];
  for (const r of logs) {
    const t = Date.parse(
      r.created_at ??
        (typeof r.createdAt === "string"
          ? r.createdAt
          : r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : ""),
    );
    if (!Number.isFinite(t)) continue;
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((t - (now - windowMs)) / bucketMs)));
    trend[idx]++;
  }
  return trend;
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, n) => s + n, 0) / values.length;
}

export function computeScorecard(input: ScorecardInput): ScorecardResult {
  const { focus, windowDays, now, currentLogs, priorLogs, appointments, openFollowUps } = input;
  const cur = currentLogs ?? [];
  const prev = priorLogs ?? [];

  const totalCalls = cur.length;
  const priorTotalCalls = prev.length;

  const totalDurationSec = cur.reduce(
    (s, r) => s + (r.duration_seconds ?? r.durationSeconds ?? 0),
    0,
  );
  const avgDurationSec = totalCalls > 0 ? Math.round(totalDurationSec / totalCalls) : 0;

  const scoredValues = cur
    .filter((r) => (r.lead_score ?? r.leadScore ?? 0) > 0)
    .map((r) => (r.lead_score ?? r.leadScore) as number);
  const priorScoredValues = prev
    .filter((r) => (r.lead_score ?? r.leadScore ?? 0) > 0)
    .map((r) => (r.lead_score ?? r.leadScore) as number);
  const avgLead = avg(scoredValues);
  const priorAvgLead = avg(priorScoredValues);

  const positive = cur.filter((r) => (r.sentiment || "").toLowerCase() === "positive").length;
  const priorPositive = prev.filter((r) => (r.sentiment || "").toLowerCase() === "positive").length;
  const positiveRate = totalCalls > 0 ? positive / totalCalls : 0;
  const priorPositiveRate = priorTotalCalls > 0 ? priorPositive / priorTotalCalls : 0;

  const apptCount = appointments?.length ?? 0;
  const conversionRate = totalCalls > 0 ? apptCount / totalCalls : 0;

  const openFollowUpCallIds = new Set(
    (openFollowUps ?? [])
      .map((t) => {
        const sid = t.source_id ?? t.sourceId;
        return typeof sid === "string" ? sid : null;
      })
      .filter(Boolean) as string[],
  );
  const resolved = cur.filter((r) => !openFollowUpCallIds.has(r.id)).length;
  const resolutionRate = totalCalls > 0 ? resolved / totalCalls : 0;

  const trend = buildTrend(cur, now, windowDays);

  let primary: PrimaryMetric;
  let secondary: SecondaryMetric[];

  switch (focus) {
    case "conversions": {
      // Prior-period appointments would need a second query — left at 0
      // intentionally so we don't synthesize a misleading delta.
      primary = {
        label: "Conversion rate",
        value: conversionRate,
        format: "percent",
        delta_pct: pctDelta(conversionRate, 0),
        trend,
      };
      secondary = [
        { label: "Conversions", value: apptCount, format: "number" },
        { label: "Calls handled", value: totalCalls, format: "number" },
        { label: "Avg call length", value: avgDurationSec, format: "seconds" },
      ];
      break;
    }
    case "qualifications": {
      primary = {
        label: "Avg lead score",
        value: Math.round(avgLead),
        format: "score",
        delta_pct: pctDelta(avgLead, priorAvgLead),
        trend,
      };
      secondary = [
        { label: "Calls handled", value: totalCalls, format: "number" },
        { label: "Scored calls", value: scoredValues.length, format: "number" },
        { label: "Avg call length", value: avgDurationSec, format: "seconds" },
      ];
      break;
    }
    case "resolutions": {
      primary = {
        label: "First-contact resolution",
        value: resolutionRate,
        format: "percent",
        delta_pct: 0,
        trend,
      };
      secondary = [
        { label: "Calls handled", value: totalCalls, format: "number" },
        { label: "Open follow-ups", value: openFollowUpCallIds.size, format: "number" },
        { label: "Avg call length", value: avgDurationSec, format: "seconds" },
      ];
      break;
    }
    case "satisfaction": {
      primary = {
        label: "Positive sentiment",
        value: positiveRate,
        format: "percent",
        delta_pct: pctDelta(positiveRate, priorPositiveRate),
        trend,
      };
      secondary = [
        { label: "Positive calls", value: positive, format: "number" },
        { label: "Calls handled", value: totalCalls, format: "number" },
        { label: "Avg lead score", value: Math.round(avgLead), format: "score" },
      ];
      break;
    }
    case "general":
    default: {
      primary = {
        label: "Calls handled",
        value: totalCalls,
        format: "number",
        delta_pct: pctDelta(totalCalls, priorTotalCalls),
        trend,
      };
      secondary = [
        { label: "Avg lead score", value: Math.round(avgLead), format: "score" },
        { label: "Avg call length", value: avgDurationSec, format: "seconds" },
        { label: "Positive calls", value: positive, format: "number" },
      ];
    }
  }

  return {
    kpi_focus: focus,
    window_days: windowDays,
    primary,
    secondary,
    sample_size: totalCalls,
  };
}
