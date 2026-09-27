import { sql, type SQL } from "drizzle-orm";
import { auditLog } from "../db/schema";
import {
  DEFAULT_MODEL,
  MODEL_LONG_CONTEXT_PRICING,
  MODEL_PRICING,
  pricingForModel,
} from "./ai-models";
import type { AuditSummary } from "./audit-summary";

type Numeric = number | string | null;
type CostBucket = { calls: Numeric; cost: Numeric };
export interface AuditSummaryAggregate {
  totals: CostBucket & {
    input: Numeric;
    output: Numeric;
    cache_read: Numeric;
    cache_create: Numeric;
    cache_savings: Numeric;
    latency_sum: Numeric;
    p50_ms: Numeric;
    p95_ms: Numeric;
    sample_count: Numeric;
  };
  by_day: Array<CostBucket & { day: string }>;
  by_action: Array<CostBucket & { action: string; latency_sum: Numeric }>;
  by_model: Array<CostBucket & { model: string }>;
}

/** Use the same per-request model/tier policy as computeAuditSummary. */
function cacheRateDifference(bucket: "cacheRead" | "cacheWrite"): SQL {
  const fallback = pricingForModel("unknown");
  const cases = Object.entries(MODEL_PRICING).map(([model, standard]) => {
    const long = MODEL_LONG_CONTEXT_PRICING[model as keyof typeof MODEL_PRICING];
    const ordinary = standard.input - standard[bucket];
    const difference = long
      ? sql`case when prompt_tokens ${long.inclusive ? sql`>=` : sql`>`} ${long.thresholdTokens}
          then ${long.rates.input - long.rates[bucket]}::numeric else ${ordinary}::numeric end`
      : sql`${ordinary}::numeric`;
    return sql`when pricing_model = ${model} then ${difference}`;
  });
  return sql`case ${sql.join(cases, sql` `)} else ${fallback.input - fallback[bucket]}::numeric end`;
}

/**
 * One snapshot of the whole tenant/time window. Postgres returns only grouped
 * values, never event metadata or a capped sample of events. Integer inputs
 * widen before summing, and UTC day grouping is independent of DB timezone.
 */
export function buildAuditSummaryQuery(userId: string, since: Date): SQL {
  return sql`
    with scoped as materialized (
      select
        coalesce(nullif(${auditLog.action}, ''), 'unknown') as action,
        coalesce(nullif(${auditLog.model}, ''), 'unknown') as model,
        regexp_replace(coalesce(nullif(${auditLog.model}, ''), ${DEFAULT_MODEL}), '^.*/', '') as pricing_model,
        (${auditLog.createdAt} at time zone 'UTC')::date::text as day,
        coalesce(${auditLog.inputTokens}, 0)::bigint as input,
        coalesce(${auditLog.outputTokens}, 0)::bigint as output,
        coalesce(${auditLog.cacheReadTokens}, 0)::bigint as cache_read,
        coalesce(${auditLog.cacheCreateTokens}, 0)::bigint as cache_create,
        case when ${auditLog.costUsd}::text in ('NaN', 'Infinity', '-Infinity') then 0
          else coalesce(${auditLog.costUsd}, 0) end as cost,
        coalesce(${auditLog.latencyMs}, 0)::bigint as latency_ms
      from ${auditLog}
      where ${auditLog.userId} = ${userId}
        and ${auditLog.createdAt} >= ${since.toISOString()}::timestamptz
    ), priced as (
      select *, input + cache_read + cache_create as prompt_tokens from scoped
    )
    select jsonb_build_object(
      'totals', (
        select to_jsonb(totals) from (
          select count(*)::text as calls,
            coalesce(sum(cost), 0)::text as cost,
            coalesce(sum(input), 0)::text as input,
            coalesce(sum(output), 0)::text as output,
            coalesce(sum(cache_read), 0)::text as cache_read,
            coalesce(sum(cache_create), 0)::text as cache_create,
            coalesce(sum(latency_ms), 0)::text as latency_sum,
            coalesce(sum((cache_read * ${cacheRateDifference("cacheRead")}
              + cache_create * ${cacheRateDifference("cacheWrite")}) / 1000000::numeric), 0)::text as cache_savings,
            percentile_disc(0.5) within group (order by latency_ms)
              filter (where latency_ms > 0) as p50_ms,
            percentile_disc(0.95) within group (order by latency_ms)
              filter (where latency_ms > 0) as p95_ms,
            count(*) filter (where latency_ms > 0)::text as sample_count
          from priced
        ) totals
      ),
      'by_day', coalesce((
        select jsonb_agg(to_jsonb(days) order by day) from (
          select day, count(*)::text as calls, sum(cost)::text as cost
          from scoped group by day
        ) days
      ), '[]'::jsonb),
      'by_action', coalesce((
        select jsonb_agg(to_jsonb(actions)) from (
          select action, count(*)::text as calls, sum(cost)::text as cost,
            sum(latency_ms)::text as latency_sum
          from scoped group by action
        ) actions
      ), '[]'::jsonb),
      'by_model', coalesce((
        select jsonb_agg(to_jsonb(models)) from (
          select model, count(*)::text as calls, sum(cost)::text as cost
          from scoped group by model
        ) models
      ), '[]'::jsonb)
    ) as summary
  `;
}

function numeric(value: Numeric, integer = false): number {
  const parsed = value === null ? 0 : Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))) {
    throw new Error("Audit summary aggregate exceeds the supported numeric range");
  }
  return parsed;
}
const round4 = (value: number) => Number(value.toFixed(4));

/** Retain the public response and JS rounding used by the raw-row helper. */
export function formatAuditSummaryAggregate(
  aggregate: AuditSummaryAggregate,
  windowDays: number,
): AuditSummary {
  const total = aggregate.totals;
  const calls = numeric(total.calls, true);
  const cost = numeric(total.cost);
  return {
    window_days: windowDays,
    totals: {
      calls,
      cost: round4(cost),
      input: numeric(total.input, true),
      output: numeric(total.output, true),
      cache_read: numeric(total.cache_read, true),
      cache_create: numeric(total.cache_create, true),
      cache_savings_usd: round4(numeric(total.cache_savings)),
      avg_cost_per_call: calls ? round4(cost / calls) : 0,
      avg_latency: calls ? Math.round(numeric(total.latency_sum, true) / calls) : 0,
    },
    latency: {
      p50_ms: numeric(total.p50_ms, true),
      p95_ms: numeric(total.p95_ms, true),
      sample_count: numeric(total.sample_count, true),
    },
    by_day: aggregate.by_day
      .map((row) => ({
        day: row.day,
        calls: numeric(row.calls, true),
        cost: round4(numeric(row.cost)),
      }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    by_action: aggregate.by_action
      .map((row) => ({
        action: row.action,
        calls: numeric(row.calls, true),
        cost: round4(numeric(row.cost)),
        avg_latency_ms: Math.round(
          numeric(row.latency_sum, true) / Math.max(1, numeric(row.calls, true)),
        ),
      }))
      .sort((a, b) => b.cost - a.cost || a.action.localeCompare(b.action)),
    by_model: aggregate.by_model
      .map((row) => ({
        model: row.model,
        calls: numeric(row.calls, true),
        cost: round4(numeric(row.cost)),
      }))
      .sort((a, b) => b.cost - a.cost || a.model.localeCompare(b.model)),
  };
}
