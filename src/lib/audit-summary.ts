// ────────────────────────────────────────────────────────────────────────
//  Audit summary math.
//
//  /api/audit/summary returns the aggregated AI-spend view rendered by
//  TWO surfaces (InsightsView's AISpendView and AdminSettings's audit
//  panel). Previously inline ~80 lines of summing/grouping/rounding in
//  the route handler. Extracted here as a pure tested module so the
//  semantics are pinned by tests and the route handler shrinks to the
//  ownership check + DB read + helper call shape.
//
//  Pure functions only. No DB.
// ────────────────────────────────────────────────────────────────────────

export interface AuditLogRow {
  action?: string | null;
  provider?: string | null;
  model?: string | null;
  input_tokens?: number | string | null;
  output_tokens?: number | string | null;
  cache_read_tokens?: number | string | null;
  cache_create_tokens?: number | string | null;
  cost_usd?: number | string | null;
  latency_ms?: number | string | null;
  created_at?: string | null;
}

export interface ByDayBucket  { day: string;    calls: number; cost: number; }
export interface ByActionBucket { action: string; calls: number; cost: number; avg_latency_ms: number; }
export interface ByModelBucket { model: string;  calls: number; cost: number; }

export interface AuditSummary {
  window_days: number;
  totals: {
    calls: number;
    cost: number;
    input: number;
    output: number;
    cache_read: number;
    cache_create: number;
    cache_savings_usd: number;
    avg_cost_per_call: number;
  };
  by_day:    ByDayBucket[];
  by_action: ByActionBucket[];
  by_model:  ByModelBucket[];
}

const num = (n: unknown): number => {
  const v = typeof n === "string" ? parseFloat(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

// USD per 1M input tokens by model family. Used to estimate cache-read
// savings: cache_read tokens are 0.10x of full-price input, so we
// "saved" 0.90x times the model's input rate per 1M cached tokens.
// Unknown models fall through to opus-rate (5) which is the conservative
// upper-bound — better to over-report savings than under.
export function inputRateForModel(model: string | null | undefined): number {
  if (!model) return 5;
  if (model.includes("haiku")) return 1;
  if (model.includes("sonnet")) return 3;
  return 5;
}

const round4 = (n: number) => Number(n.toFixed(4));

export function computeAuditSummary(input: {
  rows: AuditLogRow[];
  windowDays: number;
}): AuditSummary {
  const all = input.rows;
  const windowDays = input.windowDays;

  const totals = all.reduce(
    (acc, r) => {
      acc.calls += 1;
      acc.cost         += num(r.cost_usd);
      acc.input        += num(r.input_tokens);
      acc.output       += num(r.output_tokens);
      acc.cache_read   += num(r.cache_read_tokens);
      acc.cache_create += num(r.cache_create_tokens);
      return acc;
    },
    { calls: 0, cost: 0, input: 0, output: 0, cache_read: 0, cache_create: 0 },
  );

  const cacheSavings = all.reduce((s, r) =>
    s + (num(r.cache_read_tokens) * inputRateForModel(r.model) * 0.9) / 1_000_000,
  0);

  // By day — UTC date stamp from created_at. Skip rows with unparseable
  // timestamps so a single bad row can't throw or force a "0000-00-00"
  // bucket to the top of the sort.
  const byDayMap = new Map<string, ByDayBucket>();
  for (const r of all) {
    const day = (r.created_at || "").slice(0, 10);
    if (!day) continue;
    const b = byDayMap.get(day) ?? { day, calls: 0, cost: 0 };
    b.calls += 1;
    b.cost  += num(r.cost_usd);
    byDayMap.set(day, b);
  }
  const by_day = Array.from(byDayMap.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(d => ({ ...d, cost: round4(d.cost) }));

  // By action — sorted by cost desc so the costliest action sits at the
  // top of operator-facing tables. Average latency is rounded to int ms.
  const byActionMap = new Map<string, { action: string; calls: number; cost: number; latencySum: number }>();
  for (const r of all) {
    const action = r.action || "unknown";
    const a = byActionMap.get(action) ?? { action, calls: 0, cost: 0, latencySum: 0 };
    a.calls      += 1;
    a.cost       += num(r.cost_usd);
    a.latencySum += num(r.latency_ms);
    byActionMap.set(action, a);
  }
  const by_action: ByActionBucket[] = Array.from(byActionMap.values())
    .map(a => ({
      action: a.action,
      calls: a.calls,
      cost: round4(a.cost),
      avg_latency_ms: Math.round(a.latencySum / Math.max(1, a.calls)),
    }))
    .sort((x, y) => y.cost - x.cost);

  // By model — sorted by cost desc.
  const byModelMap = new Map<string, ByModelBucket>();
  for (const r of all) {
    const model = r.model || "unknown";
    const m = byModelMap.get(model) ?? { model, calls: 0, cost: 0 };
    m.calls += 1;
    m.cost  += num(r.cost_usd);
    byModelMap.set(model, m);
  }
  const by_model = Array.from(byModelMap.values())
    .map(m => ({ ...m, cost: round4(m.cost) }))
    .sort((x, y) => y.cost - x.cost);

  return {
    window_days: windowDays,
    totals: {
      ...totals,
      cost:               round4(totals.cost),
      cache_savings_usd:  round4(cacheSavings),
      avg_cost_per_call:  totals.calls ? round4(totals.cost / totals.calls) : 0,
      avg_latency:        totals.calls ? Math.round(all.reduce((s, r) => s + num(r.latency_ms), 0) / totals.calls) : 0,
    },
    by_day,
    by_action,
    by_model,
  };
}
