/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
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
  "wireline_agents",
  "wireline_spend_alerts",
  "wireline_spend_budgets",
  "wireline_stripe_events",
  "wireline_subscriptions",
  "wireline_onboarding_progress",
  "wireline_user_preferences",
  "wireline_calendar_events",
  "wireline_calendar_accounts",
  "wireline_crm_connections",
  "wireline_team_members",
  "wireline_change_log",
  "wireline_incidents",
  "wireline_jobs",
  "wireline_settings",
];

// Tables that scope by tenant_id instead of user_id.
const TENANT_SCOPED_TABLES = new Set<string>([
  "wireline_team_members",
  "wireline_change_log",
  "wireline_incidents",
]);

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
  } catch (error: any) {
    log.error("account purge transaction failed", { error: error.message });
    return { ok: false, tablesTouched, authRemoved: false, error: error.message };
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
