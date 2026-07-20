-- Prevent the recurring "table exists + RLS on + deny_direct_api_access, but
-- wireline_server was never GRANTed" footgun documented in
-- docs/LAUNCH_READINESS_FINETUNE_2026-07-19.md (recap artifacts, browser
-- handoffs, MCP OAuth tables).
--
-- Migrations and out-of-band CREATE TABLE IF NOT EXISTS paths typically run as
-- postgres. Without ALTER DEFAULT PRIVILEGES, every new public table after
-- migration 0069 silently blocks tenant-scoped queries that run as
-- SET LOCAL ROLE wireline_server.
--
-- Applied live 2026-07-20 via SET ROLE postgres (Supabase MCP apply_migration
-- as the limited role cannot change default privileges). Idempotent.
--
-- Does not widen access on existing intentionally ungranted globals
-- (wireline_stripe_events, wireline_demo_call_events, wireline_oauth_pending_codes).

DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE postgres';
  EXECUTE $sql$
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wireline_server
  $sql$;
  EXECUTE $sql$
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO wireline_server
  $sql$;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '0106: skipped — need SET ROLE postgres to alter default privileges';
  WHEN OTHERS THEN
    RAISE NOTICE '0106: %', SQLERRM;
END
$$;
