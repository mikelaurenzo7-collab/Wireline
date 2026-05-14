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

import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import { drizzle } from './server-context';

// Order matters: child tables before parent tables to satisfy any FKs that
// are not ON DELETE CASCADE.
export const ACCOUNT_DELETION_TABLES: ReadonlyArray<string> = [
  'wireline_audit_log',
  'wireline_signal_presence',
  'wireline_fleet_tasks',
  'wireline_webhook_deliveries',
  'wireline_webhooks',
  'wireline_intake_keys',
  'wireline_agent_lessons',
  'wireline_directives',
  'wireline_knowledge',
  'wireline_personality',
  'wireline_email_messages',
  'wireline_email_threads',
  'wireline_email_accounts',
  'wireline_call_logs',
  'wireline_outbound_leads',
  'wireline_outbound_campaigns',
  'wireline_appointments',
  'wireline_dnc_list',
  'wireline_phone_numbers',
  'wireline_agents',
  'wireline_spend_alerts',
  'wireline_spend_budgets',
  'wireline_stripe_events',
  'wireline_subscriptions',
  'wireline_onboarding_progress',
  'wireline_user_preferences',
  'wireline_calendar_events',
  'wireline_calendar_accounts',
  'wireline_crm_connections',
  'wireline_team_members',
  'wireline_change_log',
  'wireline_incidents',
  'wireline_jobs',
  'wireline_settings',
];

// Tables that scope by tenant_id instead of user_id.
const TENANT_SCOPED_TABLES = new Set<string>([
  'wireline_team_members',
  'wireline_change_log',
  'wireline_incidents',
]);

export interface PurgeAccountDeps {
  db: typeof drizzle;
  log: { warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void };
  supabaseUrl?: string;
  serviceRoleKey?: string;
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

  for (const table of ACCOUNT_DELETION_TABLES) {
    const userCol = TENANT_SCOPED_TABLES.has(table) ? 'tenant_id' : 'user_id';
    try {
      await db.execute(sql.raw(`DELETE FROM ${table} WHERE ${userCol} = '${userId}'`));
      tablesTouched.push(table);
    } catch (error: any) {
      log.warn(`account purge: ${table} error`, { error: error.message });
    }
  }

  // Delete the Supabase auth row last. Once gone the user is fully
  // unauthenticated and cannot make further requests.
  const url = deps.supabaseUrl ?? process.env.VITE_SUPABASE_URL;
  const key = deps.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      ok: false,
      tablesTouched,
      authRemoved: false,
      error: 'Supabase admin credentials missing — cannot remove auth row.',
    };
  }
  const adminClient = createClient(url, key);
  const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
  if (authErr) {
    log.error('account purge: auth.admin.deleteUser failed', { userId, error: authErr.message });
    return { ok: false, tablesTouched, authRemoved: false, error: authErr.message };
  }

  return { ok: true, tablesTouched, authRemoved: true };
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
