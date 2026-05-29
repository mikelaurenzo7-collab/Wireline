// ────────────────────────────────────────────────────────────────────────
//  Campaign analytics math.
//
//  /api/campaigns/:id/analytics renders the OutboundDialer "campaign
//  analytics" panel: a table of lead-outcome buckets + call-level stats
//  (answered count, avg duration, total cost, avg lead score). The
//  inline math was small enough to escape the earlier extraction passes
//  but had two distinct concerns mixed in — the per-lead outcome
//  rollup, and the per-call answered-only filter — that benefit from
//  being separately tested.
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface CampaignLeadRow {
  status?: string | null;
  call_id?: string | null;
}

export interface CampaignCallRow {
  duration_seconds?: number | null;
  cost_usd?: number | string | null;
  lead_score?: number | null;
}

export interface OutcomeBucket {
  status: string;
  count: number;
  /** 0–100, rounded. Buckets may not sum to exactly 100 due to rounding. */
  pct: number;
}

export interface CallStats {
  answered: number;
  avg_duration_sec: number;
  total_cost_usd: number;
  avg_lead_score: number;
}

// Calls shorter than this duration are treated as voicemail / immediate
// hang-up and excluded from the answered count + avg duration. Anything
// longer is considered a real conversation.
export const MIN_ANSWERED_CALL_DURATION_SEC = 5;

const num = (n: unknown): number => {
  const v = typeof n === "string" ? parseFloat(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

export function computeOutcomeBreakdown(leads: CampaignLeadRow[]): {
  total: number;
  outcomes: OutcomeBucket[];
} {
  const total = leads.length;
  const map = new Map<string, number>();
  for (const l of leads) {
    const status = l.status || "unknown";
    map.set(status, (map.get(status) ?? 0) + 1);
  }
  const outcomes: OutcomeBucket[] = Array.from(map.entries())
    .map(([status, count]) => ({
      status,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
  return { total, outcomes };
}

export function computeCallStats(
  rows: CampaignCallRow[],
  opts?: { minAnsweredSec?: number },
): CallStats {
  const minAnswered = opts?.minAnsweredSec ?? MIN_ANSWERED_CALL_DURATION_SEC;
  // Answered = duration strictly greater than the floor, so a call of
  // exactly minAnswered seconds is treated as not-answered. Matches
  // the inline filter the route handler used.
  const answered = rows.filter((r) => (r.duration_seconds ?? 0) > minAnswered);
  const avg_duration_sec = answered.length
    ? Math.round(answered.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / answered.length)
    : 0;
  // Cost sums every row (answered or not) — voicemail attempts still
  // cost money. Rounded to 4 decimals like the rest of the cost
  // surfaces in the app.
  const total_cost_usd = Number(rows.reduce((s, r) => s + num(r.cost_usd), 0).toFixed(4));
  // Lead score average runs over rows that have a non-null score.
  // null != 0, since 0 is a valid "no qualification yet" signal.
  const scored = rows.filter((r) => r.lead_score != null);
  const avg_lead_score = scored.length
    ? Math.round(scored.reduce((s, r) => s + (r.lead_score ?? 0), 0) / scored.length)
    : 0;
  return { answered: answered.length, avg_duration_sec, total_cost_usd, avg_lead_score };
}

// Returns the call_id values from leads that actually have one set —
// used by the route handler to .in('id', …) the matching call logs.
export function callIdsFromLeads(leads: CampaignLeadRow[]): string[] {
  const ids: string[] = [];
  for (const l of leads) if (l.call_id) ids.push(l.call_id);
  return ids;
}
