// GDPR account-deletion helpers.
//
// `purgeAccount` performs the irreversible hard-delete cascade across every
// wireline_* table that holds user-owned data, then removes the Supabase auth
// row. It is invoked from two places:
//   1. The `purge_deleted_account` job handler (fires after the 30-day grace
//      period elapses for a row in wireline_deletion_queue).
//   2. Legacy / emergency code paths that need to force-purge a user.
//
// All other callers should use the soft-delete flow via
// POST /api/account/delete + the 30-day grace window.

import { sql } from "drizzle-orm";
import { drizzle } from "./server-context";

// Order matters: child tables before parent tables to satisfy any FKs that
// are not ON DELETE CASCADE.
//
// wireline_stripe_events is intentionally omitted — it is a global Stripe
// idempotency ledger with no user_id column.
export const ACCOUNT_DELETION_TABLES: ReadonlyArray<string> = [
  "wireline_audit_log",
  "wireline_signal_presence",
  "wireline_fleet_tasks",
  "wireline_webhook_deliveries",
  "wireline_webhooks",
  "wireline_intake_keys",
  "wireline_agent_lessons",
  "wireline_directives",
  "wireline_knowledge",
  "wireline_personality",
  "wireline_email_messages",
  "wireline_email_threads",
  "wireline_email_accounts",
  "wireline_call_logs",
  "wireline_outbound_leads",
  "wireline_outbound_campaigns",
  "wireline_appointments",
  "wireline_dnc_list",
  "wireline_phone_numbers",
  "wireline_agent_conversation_messages",
  "wireline_agents",
  "wireline_director_conversation_messages",
  "wireline_director_artifact_objects",
  "wireline_director_artifacts",
  "wireline_director_profile",
  "wireline_cloned_voices",
  "wireline_pronunciation_dictionaries",
  "wireline_sms_messages",
  "wireline_sms_threads",
  "wireline_agent_team_members",
  "wireline_agent_teams",
  "wireline_call_queues",
  "wireline_cadence_runs",
  "wireline_cadences",
  "wireline_supervisor_subscriptions",
  "wireline_mobile_devices",
  "wireline_consent_log",
  "wireline_lead_dossiers",
  "wireline_goals",
  "wireline_quota_usage",
  "wireline_quota_limits",
  "wireline_spend_alerts",
  "wireline_spend_budgets",
  "wireline_password_reset_tokens",
  "wireline_email_verification_tokens",
  "wireline_subscriptions",
  "wireline_onboarding_progress",
  "wireline_user_preferences",
  "wireline_calendar_events",
  "wireline_calendar_accounts",
  "wireline_crm_connections",
  "wireline_team_members",
  "wireline_jobs",
  "wireline_settings",
];

// Tables that scope by tenant_id instead of user_id.
const TENANT_SCOPED_TABLES = new Set<string>(["wireline_team_members"]);

type ExecuteResult = { rows?: Array<{ table_exists?: boolean }> };

async function tableExists(
  tx: { execute: PurgeAccountDeps["db"]["execute"] },
  table: string,
): Promise<boolean> {
  const res = (await tx.execute(
    sql`SELECT to_regclass(${table}) IS NOT NULL AS table_exists`,
  )) as ExecuteResult;
  return Boolean(res.rows?.[0]?.table_exists);
}

export interface PurgeAccountDeps {
  db: typeof drizzle;
  log: {
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export interface PurgeAccountResult {
  ok: boolean;
  tablesTouched: string[];
  error?: string;
  authRemoved: boolean;
}

/**
 * Hard-deletes a user across every wireline_* table and removes the Supabase
 * auth record. Idempotent — running twice is safe (subsequent runs simply
 * find no rows to delete).
 */
export async function purgeAccount(
  userId: string,
  deps: PurgeAccountDeps,
): Promise<PurgeAccountResult> {
  const { db, log } = deps;
  const tablesTouched: string[] = [];

  try {
    return await db.transaction(async (tx) => {
      for (const table of ACCOUNT_DELETION_TABLES) {
        if (!(await tableExists(tx, table))) {
          log.warn("account purge skipped missing table", { table, userId });
          continue;
        }
        const userCol = TENANT_SCOPED_TABLES.has(table) ? "tenant_id" : "user_id";
        // Use parameterized query to prevent SQL injection
        // Table name is validated against known list, userId is parameterized
        await tx.execute(sql`DELETE FROM ${sql.raw(table)} WHERE ${sql.raw(userCol)} = ${userId}`);
        tablesTouched.push(table);
      }

      // Delete the local auth row last. Once gone the user is fully
      // unauthenticated and cannot make further requests.
      await tx.execute(sql`DELETE FROM wireline_users WHERE id = ${userId}`);
      return { ok: true, tablesTouched, authRemoved: true };
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("account purge transaction failed", { error: message });
    return { ok: false, tablesTouched, authRemoved: false, error: message };
  }
}

/**
 * Returns the scheduled purge timestamp for a deletion request submitted at
 * `requestedAt`. Centralised so the route, the worker, and tests agree on
 * the grace window (currently 30 days).
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

export function computeScheduledPurgeAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}
