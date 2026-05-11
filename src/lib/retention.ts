/**
 * Per-tenant data retention.
 *
 * Configurable TTLs on time-sensitive customer content. The retention
 * worker runs as a daily job (`POST /api/jobs/retention-purge`) and
 * deletes rows older than the configured cutoff per tenant.
 *
 * Tenants opt in by setting a number of days on
 * `wireline_settings.retention_days_call_logs` and
 * `wireline_settings.retention_days_emails`. A NULL value means
 * "retain forever" (the legacy behavior — chosen as the default so
 * existing operators don't experience surprise data loss when this
 * code lands).
 *
 * What gets purged:
 *   • wireline_call_logs           — when retention_days_call_logs is set
 *   • wireline_email_messages      — when retention_days_emails is set
 *   • wireline_email_threads       — same TTL as messages (cascade)
 *
 * What deliberately does NOT get purged:
 *   • wireline_audit_log    — required for SOC 2 evidence; separate policy
 *   • wireline_subscriptions / billing — required for tax and dispute history
 *   • wireline_consent_log  — required for TCPA defense
 *
 * Operators who need a longer / shorter retention on those should
 * implement a separate governance review process — silent deletion
 * would create compliance liability.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RetentionSettings {
  user_id: string;
  retention_days_call_logs: number | null;
  retention_days_emails: number | null;
}

export interface PurgeStats {
  user_id: string;
  call_logs_deleted: number;
  email_messages_deleted: number;
  email_threads_deleted: number;
  errors: string[];
}

/**
 * Compute the ISO cutoff timestamp for a given retention window.
 * Returns null when retention is disabled (`days` is null/<=0).
 */
export function cutoffFor(days: number | null | undefined, now: Date = new Date()): string | null {
  if (!days || days <= 0) return null;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

/**
 * Run a retention purge for a single tenant. Pure function over a
 * Supabase client + settings object so it can be unit-tested with
 * a mock client.
 */
export async function purgeForTenant(
  db: SupabaseClient,
  settings: RetentionSettings,
  now: Date = new Date(),
): Promise<PurgeStats> {
  const stats: PurgeStats = {
    user_id: settings.user_id,
    call_logs_deleted: 0,
    email_messages_deleted: 0,
    email_threads_deleted: 0,
    errors: [],
  };

  const callCutoff = cutoffFor(settings.retention_days_call_logs, now);
  if (callCutoff) {
    const { error, count } = await db
      .from("wireline_call_logs")
      .delete({ count: "exact" })
      .eq("user_id", settings.user_id)
      .lt("created_at", callCutoff);
    if (error) stats.errors.push(`call_logs: ${error.message}`);
    else stats.call_logs_deleted = count ?? 0;
  }

  const emailCutoff = cutoffFor(settings.retention_days_emails, now);
  if (emailCutoff) {
    // Messages first, then orphaned threads. Delete by user_id +
    // received_at < cutoff. The wireline_email_threads ON DELETE
    // CASCADE on account deletion does NOT cascade per-message TTLs,
    // so we run a separate thread sweep for any thread whose latest
    // message is older than the cutoff.
    const { error: msgErr, count: msgCount } = await db
      .from("wireline_email_messages")
      .delete({ count: "exact" })
      .eq("user_id", settings.user_id)
      .lt("received_at", emailCutoff);
    if (msgErr) stats.errors.push(`email_messages: ${msgErr.message}`);
    else stats.email_messages_deleted = msgCount ?? 0;

    const { error: threadErr, count: threadCount } = await db
      .from("wireline_email_threads")
      .delete({ count: "exact" })
      .eq("user_id", settings.user_id)
      .lt("last_message_at", emailCutoff);
    if (threadErr) stats.errors.push(`email_threads: ${threadErr.message}`);
    else stats.email_threads_deleted = threadCount ?? 0;
  }

  return stats;
}

/**
 * Page through every tenant with retention configured and run a
 * purge. Returns aggregate stats across tenants. Designed to be
 * called once daily from a cron job.
 *
 * Bias: skip tenants whose settings row is missing — they have made
 * no choice and the safe default is "retain forever".
 */
export async function runRetentionPurge(db: SupabaseClient, now: Date = new Date()): Promise<{
  tenants_scanned: number;
  tenants_purged: number;
  total_call_logs_deleted: number;
  total_email_messages_deleted: number;
  total_email_threads_deleted: number;
  errors: string[];
}> {
  const summary = {
    tenants_scanned: 0,
    tenants_purged: 0,
    total_call_logs_deleted: 0,
    total_email_messages_deleted: 0,
    total_email_threads_deleted: 0,
    errors: [] as string[],
  };

  const PAGE = 200;
  let from = 0;

  for (;;) {
    const { data, error } = await db
      .from("wireline_settings")
      .select("user_id, retention_days_call_logs, retention_days_emails")
      .or("retention_days_call_logs.gt.0,retention_days_emails.gt.0")
      .range(from, from + PAGE - 1);

    if (error) {
      summary.errors.push(`scan: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;

    summary.tenants_scanned += data.length;

    for (const row of data as RetentionSettings[]) {
      const stats = await purgeForTenant(db, row, now);
      summary.tenants_purged += 1;
      summary.total_call_logs_deleted += stats.call_logs_deleted;
      summary.total_email_messages_deleted += stats.email_messages_deleted;
      summary.total_email_threads_deleted += stats.email_threads_deleted;
      summary.errors.push(...stats.errors.map((e) => `${row.user_id}: ${e}`));
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return summary;
}
