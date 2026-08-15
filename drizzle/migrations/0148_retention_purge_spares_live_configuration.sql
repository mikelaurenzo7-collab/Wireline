-- 0148: Stop the retention purge from deleting live tenant configuration.
--
-- `wireline_purge_old_data` runs nightly per tenant (job type `purge_old_data`)
-- and deletes rows older than the tenant's retention window from a hardcoded
-- table list. Two entries on that list are not event data — they are live
-- configuration the tenant's integrations depend on:
--
--   wireline_webhooks      the tenant's registered webhook subscriptions
--                          (url, events, active, secret_encrypted)
--   wireline_intake_keys   the tenant's intake API credentials
--                          (key_hash, active, last_used_at)
--
-- Neither has anything to age out. A tenant on the 90-day minimum retention had
-- every webhook subscription and API key created more than 90 days ago hard
-- deleted overnight: integrations stopped firing and API clients started
-- receiving 401s, with no product surface reporting why and nothing to restore
-- from. `wireline_webhook_deliveries` cascades from `wireline_webhooks`, so
-- deleting an old subscription also took delivery history that was still inside
-- the retention window.
--
-- The delivery LOG stays purgeable — that is genuine event data and is what a
-- retention policy is for. Only the two configuration tables are removed from
-- the list. Everything else about the function (input validation, pinned
-- search_path, missing-table/column skips, per-table failure isolation, the
-- rows-deleted report) is carried over from 0077 unchanged.
--
-- Retiring an aged-out integration is a product decision that belongs to an
-- explicit, reviewable deactivation path with tenant notice — never to a silent
-- data-retention sweep.
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

        BEGIN
            EXECUTE format(
                'WITH affected AS (' || chr(68) || 'ELETE FROM %I WHERE %I = $1 AND %I < $2 RETURNING 1) SELECT count(*)::integer FROM affected',
                v_table.target_table_name,
                v_table.user_column,
                v_table.date_column
            ) INTO v_rows_deleted USING p_user_id, v_cutoff_date;
        EXCEPTION WHEN others THEN
            v_rows_deleted := 0;
        END;

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
    'Per-tenant data-retention purge. Deletes aged EVENT data only. Live configuration (wireline_webhooks, wireline_intake_keys) is deliberately excluded: retiring an integration is an explicit product decision, not a retention sweep.';

-- 0087 revoked PUBLIC execute and granted it to the server role. CREATE OR
-- REPLACE preserves ownership and ACLs, so no grant is re-issued here.
