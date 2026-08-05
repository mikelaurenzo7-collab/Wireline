#!/usr/bin/env tsx

import "../src/lib/load-env";
import pkg from "pg";
import { resolveDatabaseConnection } from "../src/lib/database-connection";

const { Pool } = pkg;
const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

type OutcomeReportRow = {
  current_production_accounts: number | string;
  production_calls: number | string;
  calls_with_outcome_tag: number | string;
  reviewed_outcomes: number | string;
  total_duration_seconds: number | string;
  total_provider_cost_usd: number | string;
  tool_calls_total: number | string;
  tool_calls_failed: number | string;
  escalation_attempts: number | string;
  successful_escalations: number | string;
  calls_with_pipeline_error: number | string;
  calls_with_stt_error: number | string;
  calls_with_tts_error: number | string;
  calls_with_qa_score: number | string;
  average_qa_score: number | string | null;
  production_event_rows: number | string;
  environment_drift_rows: number | string;
};

const REPORT_SQL = `
WITH params AS (
  SELECT $1::timestamptz AS from_at, $2::timestamptz AS to_at
),
production_accounts AS (
  SELECT user_id
  FROM public.wireline_settings
  WHERE account_environment = 'production'
),
production_calls AS (
  SELECT calls.*
  FROM public.wireline_call_logs AS calls
  JOIN production_accounts AS accounts ON accounts.user_id = calls.user_id
  CROSS JOIN params
  WHERE calls.created_at >= params.from_at
    AND calls.created_at < params.to_at
    AND COALESCE(calls.demo, false) = false
),
production_events AS (
  SELECT audit.action, audit.user_id, audit.created_at
  FROM public.wireline_audit_log AS audit
  JOIN production_accounts AS accounts ON accounts.user_id = audit.user_id
  CROSS JOIN params
  WHERE audit.event_type = 'product.event'
    AND audit.metadata->>'account_environment' = 'production'
    AND audit.created_at >= params.from_at
    AND audit.created_at < params.to_at
),
environment_drift AS (
  SELECT count(*)::integer AS rows
  FROM public.wireline_audit_log AS audit
  JOIN production_accounts AS accounts ON accounts.user_id = audit.user_id
  CROSS JOIN params
  WHERE audit.event_type = 'product.event'
    AND audit.metadata->>'account_environment' IS DISTINCT FROM 'production'
    AND audit.created_at >= params.from_at
    AND audit.created_at < params.to_at
)
SELECT
  (SELECT count(*)::integer FROM production_accounts) AS current_production_accounts,
  count(*)::integer AS production_calls,
  count(*) FILTER (WHERE nullif(trim(calls.outcome_tag), '') IS NOT NULL)::integer
    AS calls_with_outcome_tag,
  (SELECT count(*)::integer FROM production_events WHERE action = 'outcome_reviewed')
    AS reviewed_outcomes,
  COALESCE(sum(calls.duration_seconds), 0)::bigint AS total_duration_seconds,
  COALESCE(sum(calls.cost), 0)::numeric AS total_provider_cost_usd,
  COALESCE(sum(calls.tool_calls_total), 0)::bigint AS tool_calls_total,
  COALESCE(sum(calls.tool_calls_failed), 0)::bigint AS tool_calls_failed,
  count(*) FILTER (WHERE calls.escalation_attempted = true)::integer AS escalation_attempts,
  count(*) FILTER (WHERE calls.escalation_succeeded = true)::integer AS successful_escalations,
  count(*) FILTER (WHERE nullif(trim(calls.pipeline_error), '') IS NOT NULL)::integer
    AS calls_with_pipeline_error,
  count(*) FILTER (WHERE calls.stt_error = true)::integer AS calls_with_stt_error,
  count(*) FILTER (WHERE calls.tts_error = true)::integer AS calls_with_tts_error,
  count(*) FILTER (WHERE calls.qa_score IS NOT NULL)::integer AS calls_with_qa_score,
  round(avg(calls.qa_score) FILTER (WHERE calls.qa_score IS NOT NULL), 2) AS average_qa_score,
  (SELECT count(*)::integer FROM production_events) AS production_event_rows,
  (SELECT rows FROM environment_drift) AS environment_drift_rows
FROM production_calls AS calls;
`;

function readFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return undefined;
}

function requireDateFlag(args: string[], name: string): Date {
  const raw = readFlag(args, name)?.trim();
  if (!raw) throw new Error(`Missing required --${name} ISO date or timestamp.`);

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--${name} must be a valid ISO date or timestamp.`);
  }
  return parsed;
}

function numberValue(value: number | string | null): number {
  if (value === null) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric report value: ${String(value)}`);
  return parsed;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromAt = requireDateFlag(args, "from");
  const toAt = requireDateFlag(args, "to");
  const rangeMs = toAt.getTime() - fromAt.getTime();

  if (rangeMs <= 0) throw new Error("--to must be later than --from.");
  if (rangeMs > MAX_REPORT_RANGE_MS) {
    throw new Error("Report windows may not exceed 366 days.");
  }
  if (toAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw new Error("--to may not be materially in the future.");
  }

  const selected = resolveDatabaseConnection();
  if (selected.ignoredInvalidPoolUrl) {
    console.warn("Ignoring invalid DATABASE_POOL_URL and using the validated POSTGRES_URL fallback.");
  }

  const pool = new Pool({
    connectionString: selected.connectionString,
    max: 1,
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await client.query<OutcomeReportRow>(REPORT_SQL, [
      fromAt.toISOString(),
      toAt.toISOString(),
    ]);
    await client.query("COMMIT");

    const row = result.rows[0];
    if (!row) throw new Error("Production outcome report returned no summary row.");

    const productionCalls = numberValue(row.production_calls);
    const taggedCalls = numberValue(row.calls_with_outcome_tag);
    const reviewedOutcomes = numberValue(row.reviewed_outcomes);
    const toolCalls = numberValue(row.tool_calls_total);
    const toolFailures = numberValue(row.tool_calls_failed);
    const escalationAttempts = numberValue(row.escalation_attempts);
    const successfulEscalations = numberValue(row.successful_escalations);
    const environmentDriftRows = numberValue(row.environment_drift_rows);

    console.log(
      JSON.stringify(
        {
          ok: true,
          trustworthy: environmentDriftRows === 0,
          generatedAt: new Date().toISOString(),
          environment: "production",
          window: {
            fromInclusive: fromAt.toISOString(),
            toExclusive: toAt.toISOString(),
            days: Math.round((rangeMs / (24 * 60 * 60 * 1_000)) * 100) / 100,
          },
          methodology: {
            currentAccountClassificationRequired: "production",
            eventClassificationRequired: "production",
            demoCallsExcluded: true,
            piiIncluded: false,
            outcomeDefinition:
              "Outcome-tagged calls and explicit outcome_reviewed product events are reported separately; neither is treated as booked revenue without system-of-record evidence.",
          },
          summary: {
            currentProductionAccounts: numberValue(row.current_production_accounts),
            productionCalls,
            outcomeTaggedCalls: taggedCalls,
            outcomeReviewedEvents: reviewedOutcomes,
            outcomeTagRatePct: rate(taggedCalls, productionCalls),
            totalDurationSeconds: numberValue(row.total_duration_seconds),
            totalProviderCostUsd: numberValue(row.total_provider_cost_usd),
            toolCalls,
            toolFailures,
            toolFailureRatePct: rate(toolFailures, toolCalls),
            escalationAttempts,
            successfulEscalations,
            escalationSuccessRatePct: rate(successfulEscalations, escalationAttempts),
            callsWithPipelineError: numberValue(row.calls_with_pipeline_error),
            callsWithSttError: numberValue(row.calls_with_stt_error),
            callsWithTtsError: numberValue(row.calls_with_tts_error),
            callsWithQaScore: numberValue(row.calls_with_qa_score),
            averageQaScore: row.average_qa_score === null ? null : numberValue(row.average_qa_score),
            productionProductEvents: numberValue(row.production_event_rows),
            environmentDriftRows,
          },
          proofState:
            productionCalls === 0
              ? "unproven_no_production_calls"
              : taggedCalls === 0 && reviewedOutcomes === 0
                ? "production_calls_without_recorded_outcomes"
                : "production_outcomes_observed",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Production outcome report failed: ${message}`);
  process.exitCode = 1;
});
