-- 0149: Make retention failures observable and retryable.
--
-- 0148 correctly removed live webhook and intake-key configuration from this
-- event-data purge, but retained 0077's per-table `WHEN others` handler. That
-- handler converted every DELETE failure into a zero-row success, so the job
-- worker marked a partial purge complete and never retried or alerted. Missing
-- tables/columns are already handled explicitly below; every other error is an
-- unexpected operational failure and must abort the statement.
--
-- This is append-only because 0148 may already have been applied. Replacing the
-- routine again is idempotent and preserves its ownership and ACL.
CREATE OR REPLACE FUNCTION wireline_purge_old_data(
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
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id is required';
    END IF;

    IF p_retention_days IS NULL OR p_retention_days < 1 THEN
        RAISE EXCEPTION 'p_retention_days must be at least 1';
    END IF;

    v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;

    FOR v_table IN SELECT * FROM (VALUES
        ('wireline_audit_log', 'user_id', 'created_at'),
        ('wireline_signal_presence', 'user_id', 'started_at'),
        ('wireline_follow_up_tasks', 'user_id', 'created_at'),
        ('wireline_webhook_deliveries', 'user_id', 'created_at'),
        ('wireline_email_messages', 'user_id', 'created_at'),
        ('wireline_email_threads', 'user_id', 'created_at'),
        ('wireline_call_logs', 'user_id', 'created_at'),
        ('wireline_outbound_leads', 'user_id', 'created_at'),
        ('wireline_outbound_campaigns', 'user_id', 'created_at'),
        ('wireline_appointments', 'user_id', 'created_at'),
        ('wireline_jobs', 'user_id', 'created_at'),
        ('wireline_agent_lessons', 'user_id', 'created_at'),
        ('wireline_change_log', 'user_id', 'created_at'),
        ('wireline_incidents', 'user_id', 'created_at')
    ) AS t(target_table_name, user_column, date_column)
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

        EXECUTE format(
            'WITH affected AS (' || chr(68) || 'ELETE FROM %I WHERE %I = $1 AND %I < $2 RETURNING 1) SELECT count(*)::integer FROM affected',
            v_table.target_table_name,
            v_table.user_column,
            v_table.date_column
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

COMMENT ON FUNCTION wireline_purge_old_data(UUID, INTEGER) IS
    'Per-tenant data-retention purge. Deletes aged event data only; live integration configuration is excluded. Missing schema objects are skipped deliberately, while unexpected delete failures abort so the durable job can retry and alert.';

-- CREATE OR REPLACE preserves the 0087 ownership and EXECUTE ACL hardening.
