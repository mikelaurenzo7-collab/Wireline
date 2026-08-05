#!/usr/bin/env ts-node

import "../src/lib/load-env";
import pkg from "pg";
import { resolveDatabaseConnection } from "../src/lib/database-connection";
import { PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES } from "../src/lib/product-events";

const { Pool } = pkg;
const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const DURABLE_PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES =
  PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES.filter((event) => event !== "signup_started");

type ActivationReportRow = {
  stage_order: number;
  event_name: string;
  period_unique_accounts: number;
  period_events: number;
  cohort_accounts_observed_by_to: number;
  current_production_accounts: number;
  signup_cohort_accounts: number;
  production_product_events_in_window: number;
  excluded_nonproduction_product_events_in_window: number;
  environment_drift_rows: number;
  production_accounts_without_signup_event: number;
};

const REPORT_SQL = `
WITH params AS (
  SELECT $1::timestamptz AS from_at, $2::timestamptz AS to_at
),
stages AS (
  SELECT ordinality::integer AS stage_order, event_name
  FROM unnest($3::text[]) WITH ORDINALITY AS stage(event_name, ordinality)
),
production_accounts AS (
  SELECT user_id
  FROM public.wireline_settings
  WHERE account_environment = 'production'
),
eligible_events AS (
  SELECT audit.user_id, audit.action, audit.created_at
  FROM public.wireline_audit_log AS audit
  JOIN production_accounts AS accounts ON accounts.user_id = audit.user_id
  WHERE audit.event_type = 'product.event'
    AND audit.metadata->>'account_environment' = 'production'
),
first_signups AS (
  SELECT user_id, min(created_at) AS signup_at
  FROM eligible_events
  WHERE action = 'signup_completed'
  GROUP BY user_id
),
cohorts AS (
  SELECT first_signups.user_id, first_signups.signup_at
  FROM first_signups
  CROSS JOIN params
  WHERE first_signups.signup_at >= params.from_at
    AND first_signups.signup_at < params.to_at
),
summary AS (
  SELECT
    (SELECT count(*)::integer FROM production_accounts) AS current_production_accounts,
    (SELECT count(*)::integer FROM cohorts) AS signup_cohort_accounts,
    (
      SELECT count(*)::integer
      FROM eligible_events
      CROSS JOIN params
      WHERE eligible_events.created_at >= params.from_at
        AND eligible_events.created_at < params.to_at
    ) AS production_product_events_in_window,
    (
      SELECT count(*)::integer
      FROM public.wireline_audit_log AS audit
      CROSS JOIN params
      WHERE audit.event_type = 'product.event'
        AND audit.created_at >= params.from_at
        AND audit.created_at < params.to_at
        AND audit.metadata->>'account_environment' IS DISTINCT FROM 'production'
    ) AS excluded_nonproduction_product_events_in_window,
    (
      SELECT count(*)::integer
      FROM public.wireline_audit_log AS audit
      JOIN production_accounts AS accounts ON accounts.user_id = audit.user_id
      WHERE audit.event_type = 'product.event'
        AND audit.metadata->>'account_environment' IS DISTINCT FROM 'production'
    ) AS environment_drift_rows,
    (
      SELECT count(*)::integer
      FROM production_accounts AS accounts
      LEFT JOIN first_signups ON first_signups.user_id = accounts.user_id
      WHERE first_signups.user_id IS NULL
    ) AS production_accounts_without_signup_event
)
SELECT
  stages.stage_order,
  stages.event_name,
  (
    SELECT count(DISTINCT events.user_id)::integer
    FROM eligible_events AS events
    CROSS JOIN params
    WHERE events.action = stages.event_name
      AND events.created_at >= params.from_at
      AND events.created_at < params.to_at
  ) AS period_unique_accounts,
  (
    SELECT count(*)::integer
    FROM eligible_events AS events
    CROSS JOIN params
    WHERE events.action = stages.event_name
      AND events.created_at >= params.from_at
      AND events.created_at < params.to_at
  ) AS period_events,
  CASE
    WHEN stages.event_name = 'signup_completed' THEN summary.signup_cohort_accounts
    ELSE (
      SELECT count(DISTINCT cohorts.user_id)::integer
      FROM cohorts
      JOIN eligible_events AS events
        ON events.user_id = cohorts.user_id
       AND events.action = stages.event_name
       AND events.created_at >= cohorts.signup_at
       AND events.created_at < (SELECT to_at FROM params)
    )
  END AS cohort_accounts_observed_by_to,
  summary.current_production_accounts,
  summary.signup_cohort_accounts,
  summary.production_product_events_in_window,
  summary.excluded_nonproduction_product_events_in_window,
  summary.environment_drift_rows,
  summary.production_accounts_without_signup_event
FROM stages
CROSS JOIN summary
ORDER BY stages.stage_order;
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

function numberValue(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric report value: ${String(value)}`);
  return parsed;
}

function percent(numerator: number, denominator: number): number | null {
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
    const result = await client.query<ActivationReportRow>(REPORT_SQL, [
      fromAt.toISOString(),
      toAt.toISOString(),
      DURABLE_PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES,
    ]);
    await client.query("COMMIT");

    if (result.rows.length !== DURABLE_PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES.length) {
      throw new Error("Activation report did not return the complete durable funnel.");
    }

    const first = result.rows[0];
    if (!first) throw new Error("Activation report returned no stages.");

    const signupCohortAccounts = numberValue(first.signup_cohort_accounts);
    const environmentDriftRows = numberValue(first.environment_drift_rows);
    const stages = result.rows.map((row, index) => {
      const expectedEvent = DURABLE_PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES[index];
      if (row.event_name !== expectedEvent || numberValue(row.stage_order) !== index + 1) {
        throw new Error("Activation report stage order diverged from the canonical funnel.");
      }

      const periodUniqueAccounts = numberValue(row.period_unique_accounts);
      const periodEvents = numberValue(row.period_events);
      const cohortAccountsObservedByTo = numberValue(row.cohort_accounts_observed_by_to);

      return {
        order: index + 1,
        event: row.event_name,
        periodUniqueAccounts,
        periodEvents,
        duplicateOrRepeatEvents: Math.max(0, periodEvents - periodUniqueAccounts),
        cohortAccountsObservedByTo,
        conversionFromSignupCohortPct: percent(
          cohortAccountsObservedByTo,
          signupCohortAccounts,
        ),
      };
    });

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
            distinctAccounts: true,
            currentAccountClassificationRequired: "production",
            eventClassificationRequired: "production",
            signupCohort:
              "Accounts whose first durable signup_completed event occurred inside the window.",
            cohortObservation:
              "Later durable milestones occurring at or after first signup and before toExclusive.",
            durableStages: [...DURABLE_PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES],
            piiIncluded: false,
          },
          summary: {
            currentProductionAccounts: numberValue(first.current_production_accounts),
            signupCohortAccounts,
            productionProductEventsInWindow: numberValue(
              first.production_product_events_in_window,
            ),
            excludedNonProductionProductEventsInWindow: numberValue(
              first.excluded_nonproduction_product_events_in_window,
            ),
            environmentDriftRows,
            productionAccountsWithoutSignupEvent: numberValue(
              first.production_accounts_without_signup_event,
            ),
          },
          stages,
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
  console.error(`Production activation report failed: ${message}`);
  process.exitCode = 1;
});
