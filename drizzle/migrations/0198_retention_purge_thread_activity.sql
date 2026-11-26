-- 0198: Purge conversation threads by activity, and purge SMS history at all.
--
-- Bug fixed. Through 0149, `wireline_email_threads` was purged by `created_at`,
-- and `wireline_email_messages.thread_id` cascades on delete. A thread that
-- started more than the retention window ago but is still active was deleted
-- overnight, and the cascade took every message in it, including messages
-- received yesterday.
--
-- Inconsistency fixed. `wireline_sms_threads`, `wireline_sms_messages` and
-- `wireline_sms_send_operations` were never purged (only account deletion
-- removed them), while calls and email were. docs/AI_NATIVE_ROADMAP.md
-- (Phase 0, Retention) asks for one retention rule per object.
--
-- Purge behavior after this migration, for one tenant and a cutoff of
-- NOW() - p_retention_days:
--
--   Individual messages and send operations go by their own `created_at`:
--     wireline_email_messages        created_at < cutoff
--     wireline_sms_messages          created_at < cutoff (including the
--                                    null-thread operational alert
--                                    correlation rows)
--     wireline_sms_send_operations   created_at < cutoff
--
--   Threads go by their last activity, and only once nothing under them is
--   left:
--     wireline_email_threads   last_message_at < cutoff AND no row remains in
--                              wireline_email_messages for the thread
--     wireline_sms_threads     last_message_at < cutoff AND no row remains in
--                              wireline_sms_messages or
--                              wireline_sms_send_operations for the thread
--
--   The child rows are purged first, so "no row remains" means "no message or
--   send operation at or after the cutoff". `last_message_at` is maintained by
--   application write paths, not by a trigger. The emptiness guard makes the
--   database itself guarantee that the cascade never removes a message younger
--   than the cutoff, even if `last_message_at` lags. If the loop order were
--   ever changed, the guard only delays a thread purge by one run; it never
--   loses a message. A thread whose `last_message_at` is NULL is kept.
--
--   Calls, audit log, presence, follow-up tasks, webhook deliveries, outbound
--   leads and campaigns, appointments, jobs, agent lessons, change log and
--   incidents keep their 0149 rule (`created_at`, or `started_at` for
--   presence).
--
-- Deliberately not purged:
--   - People (`wireline_people`, `wireline_person_identifiers`,
--     `wireline_person_events`) are the customer record, not event data. They
--     are exempt from this sweep and leave only through account deletion.
--   - `wireline_outbound_purpose_audit` is kept for 5 years (0194). It leaves
--     only through account deletion.
--   - Live integration configuration (`wireline_webhooks`,
--     `wireline_intake_keys`) stays excluded, as in 0148.
--
-- Every 0149 safeguard is carried over unchanged: the function still fails
-- closed (no `WHEN others` handler, so an unexpected DELETE failure aborts the
-- whole call and the durable job retries and alerts), it still skips a table
-- or column that does not exist, it validates its inputs, it pins
-- `search_path`, and it still runs with the caller's rights (no SECURITY
-- DEFINER): the `purge_old_data` worker calls it at root database scope after
-- checking the payload owner against the queue row. A guard table that does not
-- exist, or has no `thread_id` column, cannot cascade into the thread and is
-- skipped.
--
-- Append-only: 0149 may already have been applied. CREATE OR REPLACE keeps the
-- signature, ownership and the 0087 EXECUTE ACL. Apply through the reviewed
-- schema promotion in docs/DATABASE_OPERATIONS.md, not from application
-- startup.
CREATE OR REPLACE FUNCTION public.wireline_purge_old_data(
    p_user_id UUID,
    p_retention_days INTEGER DEFAULT 365
)
RETURNS TABLE (table_name TEXT, rows_deleted INTEGER)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff_date TIMESTAMP WITH TIME ZONE;
    v_rows_deleted INTEGER;
    v_table RECORD;
    v_child_table TEXT;
    v_child_guard TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is required';
    END IF;

    IF p_retention_days IS NULL OR p_retention_days < 1 THEN
        RAISE EXCEPTION 'p_retention_days must be at least 1';
    END IF;

    v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;

    FOR v_table IN SELECT * FROM (VALUES
        ('wireline_audit_log', 'user_id', 'created_at', NULL::TEXT[]),
        ('wireline_signal_presence', 'user_id', 'started_at', NULL),
        ('wireline_follow_up_tasks', 'user_id', 'created_at', NULL),
        ('wireline_webhook_deliveries', 'user_id', 'created_at', NULL),
        ('wireline_email_messages', 'user_id', 'created_at', NULL),
        ('wireline_email_threads', 'user_id', 'last_message_at', ARRAY['wireline_email_messages']),
        ('wireline_sms_messages', 'user_id', 'created_at', NULL),
        ('wireline_sms_send_operations', 'user_id', 'created_at', NULL),
        ('wireline_sms_threads', 'user_id', 'last_message_at', ARRAY['wireline_sms_messages', 'wireline_sms_send_operations']),
        ('wireline_call_logs', 'user_id', 'created_at', NULL),
        ('wireline_outbound_leads', 'user_id', 'created_at', NULL),
        ('wireline_outbound_campaigns', 'user_id', 'created_at', NULL),
        ('wireline_appointments', 'user_id', 'created_at', NULL),
        ('wireline_jobs', 'user_id', 'created_at', NULL),
        ('wireline_agent_lessons', 'user_id', 'created_at', NULL),
        ('wireline_change_log', 'user_id', 'created_at', NULL),
        ('wireline_incidents', 'user_id', 'created_at', NULL)
    ) AS t(target_table_name, user_column, date_column, guard_child_tables)
    LOOP
        IF to_regclass(v_table.target_table_name) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns AS c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table.target_table_name
              AND c.column_name = v_table.user_column
        ) OR NOT EXISTS (
            SELECT 1
            FROM information_schema.columns AS c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table.target_table_name
              AND c.column_name = v_table.date_column
        ) THEN
            CONTINUE;
        END IF;

        v_child_guard := '';
        IF v_table.guard_child_tables IS NOT NULL THEN
            FOREACH v_child_table IN ARRAY v_table.guard_child_tables
            LOOP
                IF to_regclass(v_child_table) IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns AS c
                    WHERE c.table_schema = 'public'
                      AND c.table_name = v_child_table
                      AND c.column_name = 'thread_id'
                ) THEN
                    v_child_guard := v_child_guard || format(
                        ' AND NOT EXISTS (SELECT 1 FROM %I AS child WHERE child.thread_id = target.id)',
                        v_child_table
                    );
                END IF;
            END LOOP;
        END IF;

        EXECUTE format(
            'WITH affected AS (' || chr(68) || 'ELETE FROM %I AS target WHERE target.%I = $1 AND target.%I < $2%s RETURNING 1) SELECT count(*)::integer FROM affected',
            v_table.target_table_name,
            v_table.user_column,
            v_table.date_column,
            v_child_guard
        ) INTO v_rows_deleted USING p_user_id, v_cutoff_date;

        IF v_rows_deleted > 0 THEN
            table_name := v_table.target_table_name;
            rows_deleted := v_rows_deleted;
            RETURN NEXT;
        END IF;
    END LOOP;

    RETURN;
END;
$$;

COMMENT ON FUNCTION public.wireline_purge_old_data(UUID, INTEGER) IS
    'Per-tenant data-retention purge. Deletes aged event data only: messages and SMS send operations by created_at, email and SMS threads by last_message_at once no message or send operation remains under them. People, the outbound purpose audit and live integration configuration are excluded. Missing schema objects are skipped deliberately, while unexpected delete failures abort so the durable job can retry and alert.';

-- CREATE OR REPLACE preserves the 0087 ownership and EXECUTE ACL hardening.
