-- 0066: restore authenticated-role access for tenant-scoped RLS tables.
--
-- Production now scopes server queries by SET LOCAL ROLE authenticated plus
-- app.current_user_id. Migration 0045 revoked table/sequence access from that
-- role, which left authenticated API paths unable to read even the first
-- wireline_settings probe. Restore CRUD grants for the RLS-protected tenant
-- tables the application actually uses, keep service-only tables locked down,
-- and add the missing accounts policy introduced by 0059.

DO $$
DECLARE
  tbl text;
BEGIN
  IF to_regclass('public.wireline_accounts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.wireline_accounts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.wireline_accounts';
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON public.wireline_accounts
      FOR ALL
      USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
      WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    $policy$;
  END IF;

  FOR tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN (
      SELECT tablename, count(*)::int AS policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
      GROUP BY tablename
    ) p ON p.tablename = c.relname
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'wireline_%'
      AND (coalesce(p.policy_count, 0) > 0 OR c.relname = 'wireline_accounts')
      AND c.relname NOT IN (
        'wireline_call_reliability_staging',
        'wireline_demo_call_events',
        'wireline_oauth_pending_codes',
        'wireline_stripe_events',
        'wireline_training_backup_20260609',
        'wireline_webhook_health'
      )
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      tbl
    );
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
