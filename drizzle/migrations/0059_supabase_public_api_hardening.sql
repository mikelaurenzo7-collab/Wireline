-- 0059: Supabase public API hardening for post-0030 tables.
--
-- Why this exists:
--   * 0030 revoked anon on then-existing wireline_* tables, but later migrations
--     created new public tables and sequences after that point.
--   * Wireline intentionally impersonates the authenticated role inside the
--     server pool (see src/lib/server-context.ts), so authenticated grants on
--     tenant tables are expected and must remain.
--   * The launch-risk we want to eliminate is anonymous discovery/readability
--     through Supabase's generated Data APIs, plus a missing tenant policy on
--     wireline_webhook_health.

-- 1) Remove anon access from every existing Wireline table and sequence.
DO $$
DECLARE tbl text;
DECLARE seq_name text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'wireline_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
  END LOOP;

  FOR seq_name IN
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
      AND sequence_name LIKE 'wireline_%'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon', seq_name);
  END LOOP;
END $$;

-- 2) Keep future public-schema objects off anon by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 3) webhook_health is tenant-scoped and read by reliability queries while the
--    server impersonates the authenticated role. Give it the same policy shape
--    as the rest of the tenant tables.
ALTER TABLE IF EXISTS wireline_webhook_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_webhook_health;
CREATE POLICY tenant_isolation ON wireline_webhook_health
  FOR ALL
  TO authenticated
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

-- 4) Re-assert owner-only posture for internal tables that should never be
--    reachable through Supabase's public Data APIs.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'wireline_oauth_pending_codes',
    'wireline_stripe_events',
    'wireline_call_reliability_staging',
    'wireline_training_backup_20260609'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS no_access_internal ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY no_access_internal ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        tbl
      );
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', tbl);
    END IF;
  END LOOP;
END $$;