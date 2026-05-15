-- Migration: Add wireline_purge_old_data function for GDPR/data retention compliance
-- This function purges data older than the retention period for a specific user

CREATE OR REPLACE FUNCTION wireline_purge_old_data(
    p_user_id UUID,
    p_retention_days INTEGER DEFAULT 365
)
RETURNS TABLE (table_name TEXT, rows_deleted INTEGER) AS $$
DECLARE
    v_cutoff_date TIMESTAMP WITH TIME ZONE;
    v_rows_deleted INTEGER;
    v_table RECORD;
BEGIN
    -- Calculate cutoff date based on retention policy
    v_cutoff_date := NOW() - (p_retention_days || ' days')::INTERVAL;

    -- Array of tables to purge with their user_id column and created_at column
    -- Format: (table_name, user_column, date_column)
    FOR v_table IN SELECT * FROM (VALUES
        ('wireline_audit_log', 'user_id', 'created_at'),
        ('wireline_signal_presence', 'user_id', 'started_at'),
        ('wireline_fleet_tasks', 'user_id', 'created_at'),
        ('wireline_webhook_deliveries', 'user_id', 'created_at'),
        ('wireline_webhooks', 'user_id', 'created_at'),
        ('wireline_intake_keys', 'user_id', 'created_at'),
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
    ) AS t(table_name, user_column, date_column)
    LOOP
        -- Execute dynamic delete for each table
        EXECUTE format(
            'DELETE FROM %I WHERE %I = $1 AND %I < $2 RETURNING COUNT(*)',
            v_table.table_name,
            v_table.user_column,
            v_table.date_column
        ) INTO v_rows_deleted USING p_user_id, v_cutoff_date;

        IF v_rows_deleted > 0 THEN
            table_name := v_table.table_name;
            rows_deleted := v_rows_deleted;
            RETURN NEXT;
        END IF;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION wireline_purge_old_data(UUID, INTEGER) IS 
'Purges user data older than the specified retention period. Returns count of deleted rows per table. Used for GDPR compliance and data retention policies.';
