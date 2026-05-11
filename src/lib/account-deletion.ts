/**
 * Account export & cascading account deletion.
 *
 * Implements the GDPR Article 15 (right of access / data portability)
 * and Article 17 (right to erasure) primitives. Both run in two
 * stages so a fat-fingered request is recoverable:
 *
 *   1. POST /api/account/export → tenant downloads a JSON archive
 *      containing every row across `wireline_*` tables they own.
 *   2. POST /api/account/delete-request → marks the tenant for deletion
 *      in `deleted_at_pending`; nothing is removed yet.
 *   3. After the grace period (default 7 days) the daily retention
 *      cron runs `processPendingAccountDeletions()` to actually wipe
 *      the rows. Operators can call POST /api/account/cancel-deletion
 *      during the grace period to abort.
 *
 * Tables we own (everything `wireline_*` with a `user_id` column).
 * The list is centralized here so a new table is one line away from
 * being included in both export and deletion — easy to audit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every user-scoped table. ORDER MATTERS for deletion — children before
 * parents to avoid FK violations even though most are RLS-only.
 *
 * If you add a new `wireline_*` table with a user_id column, add it here.
 * The `tenancy-isolation.test.ts` suite (and the deletion contract test)
 * cross-checks this list against the schema to surface drift.
 */
export const USER_SCOPED_TABLES = [
  // Detail rows (delete first)
  "wireline_email_messages",
  "wireline_email_threads",
  "wireline_email_accounts",
  "wireline_agent_lessons",
  "wireline_directives",
  "wireline_knowledge",
  "wireline_personality",
  "wireline_appointments",
  "wireline_call_logs",
  "wireline_outbound_leads",
  "wireline_outbound_campaigns",
  "wireline_signal_presence",
  "wireline_consent_log",
  "wireline_quota_usage",
  "wireline_quota_limits",
  "wireline_jobs",
  "wireline_change_log",
  "wireline_incidents",
  "wireline_team_members",
  "wireline_intake_keys",
  "wireline_webhook_deliveries",
  "wireline_webhooks",
  "wireline_dnc_list",
  "wireline_fleet_tasks",
  "wireline_user_preferences",
  "wireline_onboarding_progress",
  "wireline_subscriptions",
  // Parent rows last
  "wireline_agents",
  // Audit log is preserved for compliance — see PRESERVED_TABLES.
  // wireline_settings is kept until the very end so we can flip the
  // pending-deletion flag without losing the row mid-process.
] as const;

/**
 * Tables intentionally NOT deleted on tenant erasure:
 *   • wireline_audit_log — required for SOC 2 Trust Service criteria;
 *     anonymized via `user_id → NULL` on actual deletion (see notes).
 *
 * If you add a regulatory-retention table, list it here with a comment
 * explaining the legal basis so reviewers don't accidentally include it
 * in the per-tenant cascade.
 */
export const PRESERVED_TABLES = ["wireline_audit_log"] as const;

export interface AccountExport {
  exported_at: string;
  user_id: string;
  format_version: 1;
  tables: Record<string, unknown[]>;
  truncated: string[]; // tables we couldn't fully serialize
}

export interface DeletionResult {
  user_id: string;
  rows_deleted: Record<string, number>;
  errors: string[];
}

/**
 * Page through every user-scoped table for the given user_id and
 * accumulate rows into a single archive object. Caller is responsible
 * for serializing + signing the resulting JSON and returning it.
 */
export async function buildAccountExport(
  db: SupabaseClient,
  userId: string,
  opts: { pageSize?: number; maxRowsPerTable?: number } = {},
): Promise<AccountExport> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRowsPerTable ?? 100_000;
  const tables: Record<string, unknown[]> = {};
  const truncated: string[] = [];

  for (const table of USER_SCOPED_TABLES) {
    const rows: unknown[] = [];
    let from = 0;
    for (;;) {
      const to = from + pageSize - 1;
      const { data, error } = await db
        .from(table)
        .select("*")
        .eq("user_id", userId)
        .range(from, to);
      if (error) {
        // Don't fail the whole export — a missing table or a column
        // mismatch should surface in `truncated[]` so the operator can
        // re-run after the schema migration ships, not block the export.
        truncated.push(`${table}:${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (rows.length >= maxRows) {
        truncated.push(`${table}:exceeded_max_rows`);
        break;
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
    tables[table] = rows;
  }

  // Settings sits behind a unique(user_id) constraint and is always tiny.
  const { data: settings } = await db
    .from("wireline_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  tables["wireline_settings"] = settings ? [settings] : [];

  return {
    exported_at: new Date().toISOString(),
    user_id: userId,
    format_version: 1,
    tables,
    truncated,
  };
}

/**
 * Cascading hard delete of every row owned by the user across every
 * `wireline_*` table in `USER_SCOPED_TABLES`. Errors are collected
 * per table so a single failing delete doesn't strand the rest in
 * an inconsistent state.
 *
 * This does NOT delete the Supabase auth user — that requires the
 * service-role auth admin API and is the caller's responsibility
 * (it's a separate explicit step so a misfired call to this function
 * doesn't lock the operator out of their account).
 */
export async function hardDeleteAccount(
  db: SupabaseClient,
  userId: string,
): Promise<DeletionResult> {
  const result: DeletionResult = {
    user_id: userId,
    rows_deleted: {},
    errors: [],
  };

  for (const table of USER_SCOPED_TABLES) {
    const { error, count } = await db
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", userId);
    if (error) result.errors.push(`${table}: ${error.message}`);
    else result.rows_deleted[table] = count ?? 0;
  }

  // Anonymize the audit log instead of deleting (preserves the security
  // record while honoring the right to erasure of the linked identity).
  const { error: auditErr, count: auditCount } = await db
    .from("wireline_audit_log")
    .update({ user_id: null, user_email: null })
    .eq("user_id", userId);
  if (auditErr) result.errors.push(`wireline_audit_log: ${auditErr.message}`);
  else result.rows_deleted["wireline_audit_log_anonymized"] = (auditCount as unknown as number) ?? 0;

  // Settings row last — once gone, the tenant has no anchor to log in.
  const { error: settingsErr, count: settingsCount } = await db
    .from("wireline_settings")
    .delete({ count: "exact" })
    .eq("user_id", userId);
  if (settingsErr) result.errors.push(`wireline_settings: ${settingsErr.message}`);
  else result.rows_deleted["wireline_settings"] = settingsCount ?? 0;

  return result;
}

/**
 * Default grace period before a deletion request actually runs. Operators
 * can override per-tenant via `wireline_settings.deletion_grace_days`.
 */
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

/**
 * Compute the deadline (ISO timestamp) by which a cancellation must be
 * received, given a request time and grace-period configuration.
 */
export function deletionDeadline(
  requestedAt: Date,
  graceDays: number = DEFAULT_GRACE_PERIOD_DAYS,
): string {
  if (!Number.isFinite(graceDays) || graceDays < 0) graceDays = DEFAULT_GRACE_PERIOD_DAYS;
  const deadline = new Date(requestedAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
  return deadline.toISOString();
}
