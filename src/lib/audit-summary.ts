import { MODEL_PRICING } from "./ai-models";

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
  inputTokens?: number | string | null;
  outputTokens?: number | string | null;
  cacheReadTokens?: number | string | null;
  cacheCreateTokens?: number | string | null;
  costUsd?: number | string | null;
  latencyMs?: number | string | null;
  createdAt?: string | Date | null;
  // Backward compatibility fields
  input_tokens?: number | string | null;
  output_tokens?: number | string | null;
  cache_read_tokens?: number | string | null;
  cache_create_tokens?: number | string | null;
  cost_usd?: number | string | null;
  latency_ms?: number | string | null;
  created_at?: string | null;
}

export interface ByDayBucket {
  day: string;
  calls: number;
  cost: number;
}
export interface ByActionBucket {
  action: string;
  calls: number;
  cost: number;
  avg_latency_ms: number;
}
export interface ByModelBucket {
  model: string;
  calls: number;
  cost: number;
}

export interface LatencyPercentiles {
  p50_ms: number;
  p95_ms: number;
  sample_count: number;
}

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
    avg_latency: number;
  };
  latency: LatencyPercentiles;
  by_day: ByDayBucket[];
  by_action: ByActionBucket[];
  by_model: ByModelBucket[];
}

/** p50 / p95 from sorted latencies (audit log AI + tool rows). */
export function computeLatencyPercentiles(rows: AuditLogRow[]): LatencyPercentiles {
  const values = rows
    .map((r) => num(r.latencyMs ?? r.latency_ms))
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return { p50_ms: 0, p95_ms: 0, sample_count: 0 };
  }
  const at = (q: number) => {
    const idx = Math.min(values.length - 1, Math.max(0, Math.ceil(q * values.length) - 1));
    return Math.round(values[idx]);
  };
  return { p50_ms: at(0.5), p95_ms: at(0.95), sample_count: values.length };
}

const num = (n: unknown): number => {
  if (n === undefined || n === null) return 0;
  const v = typeof n === "string" ? parseFloat(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

/** Input $/MTok for audit dashboards — derived from MODEL_PRICING (single source of truth). */
export function inputRateForModel(model: string | null | undefined): number {
  const primaryRate = MODEL_PRICING["gpt-5.6-terra"].input;
  if (!model) return primaryRate;
  const bare = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  const pricing = MODEL_PRICING[bare as keyof typeof MODEL_PRICING];
  if (pricing) return pricing.input;
  if (bare.includes("gemini") && bare.includes("flash")) return 0.3;
  return primaryRate;
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
      acc.cost += num(r.costUsd ?? r.cost_usd);
      acc.input += num(r.inputTokens ?? r.input_tokens);
      acc.output += num(r.outputTokens ?? r.output_tokens);
      acc.cache_read += num(r.cacheReadTokens ?? r.cache_read_tokens);
      acc.cache_create += num(r.cacheCreateTokens ?? r.cache_create_tokens);
      return acc;
    },
    { calls: 0, cost: 0, input: 0, output: 0, cache_read: 0, cache_create: 0 },
  );

  const cacheSavings = all.reduce((s, r) => {
    const cacheRead = num(r.cacheReadTokens ?? r.cache_read_tokens);
    return s + (cacheRead * inputRateForModel(r.model) * 0.9) / 1_000_000;
  }, 0);

  const byDayMap = new Map<string, ByDayBucket>();
  for (const r of all) {
    const dateVal = r.createdAt ?? r.created_at;
    const day =
      typeof dateVal === "string"
        ? dateVal.slice(0, 10)
        : dateVal instanceof Date
          ? dateVal.toISOString().slice(0, 10)
          : "";
    if (!day) continue;
    const b = byDayMap.get(day) ?? { day, calls: 0, cost: 0 };
    b.calls += 1;
    b.cost += num(r.costUsd ?? r.cost_usd);
    byDayMap.set(day, b);
  }
  const by_day = Array.from(byDayMap.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ ...d, cost: round4(d.cost) }));

  const byActionMap = new Map<
    string,
    { action: string; calls: number; cost: number; latencySum: number }
  >();
  for (const r of all) {
    const action = r.action || "unknown";
    const a = byActionMap.get(action) ?? { action, calls: 0, cost: 0, latencySum: 0 };
    a.calls += 1;
    a.cost += num(r.costUsd ?? r.cost_usd);
    a.latencySum += num(r.latencyMs ?? r.latency_ms);
    byActionMap.set(action, a);
  }
  const by_action: ByActionBucket[] = Array.from(byActionMap.values())
    .map((a) => ({
      action: a.action,
      calls: a.calls,
      cost: round4(a.cost),
      avg_latency_ms: Math.round(a.latencySum / Math.max(1, a.calls)),
    }))
    .sort((x, y) => y.cost - x.cost);

  const byModelMap = new Map<string, ByModelBucket>();
  for (const r of all) {
    const model = r.model || "unknown";
    const m = byModelMap.get(model) ?? { model, calls: 0, cost: 0 };
    m.calls += 1;
    m.cost += num(r.costUsd ?? r.cost_usd);
    byModelMap.set(model, m);
  }
  const by_model = Array.from(byModelMap.values())
    .map((m) => ({ ...m, cost: round4(m.cost) }))
    .sort((x, y) => y.cost - x.cost);

  const totalLatency = all.reduce((s, r) => s + num(r.latencyMs ?? r.latency_ms), 0);

  return {
    window_days: windowDays,
    totals: {
      ...totals,
      cost: round4(totals.cost),
      cache_savings_usd: round4(cacheSavings),
      avg_cost_per_call: totals.calls ? round4(totals.cost / totals.calls) : 0,
      avg_latency: totals.calls ? Math.round(totalLatency / totals.calls) : 0,
    },
    latency: computeLatencyPercentiles(all),
    by_day,
    by_action,
    by_model,
  };
}
