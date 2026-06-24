-- 0069: Move tenant DB access off the Supabase `authenticated` role.
--
-- Wireline's server scopes queries with SET LOCAL ROLE + app.current_user_id.
-- Migration 0066 restored GRANTs on `authenticated`, which satisfies RLS but
-- also exposes every wireline_* table in the Supabase GraphQL schema (lint 0027).
-- `authenticated` is reserved for Supabase Auth clients; Wireline never uses
-- supabase-js against Postgres. Tenant access now runs as `wireline_server`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    CREATE ROLE wireline_server NOLOGIN;
  END IF;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
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
      AND (
        coalesce(p.policy_count, 0) > 0
        OR c.relname = 'wireline_accounts'
      )
      AND c.relname NOT IN (
        'wireline_demo_call_events',
        'wireline_oauth_pending_codes',
        'wireline_stripe_events',
        'wireline_training_backup_20260609',
        'kv_store_64639c03'
      )
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO wireline_server',
      tbl
    );
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO wireline_server;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wireline_server;

DO $$
DECLARE
  app_role text := current_user;
BEGIN
  EXECUTE format('GRANT wireline_server TO %I', app_role);
END $$;

-- Extend tenant RLS policies that targeted `authenticated` to include wireline_server.
DO $$
DECLARE
  pol record;
  roles_sql text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'authenticated' = ANY(roles)
      AND NOT 'wireline_server' = ANY(roles)
  LOOP
    SELECT string_agg(quote_ident(r), ', ' ORDER BY r)
    INTO roles_sql
    FROM (
      SELECT DISTINCT unnest(pol.roles || ARRAY['wireline_server']::name[]) AS r
    ) expanded;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      roles_sql
    );
  END LOOP;
END $$;

-- Fail closed for Supabase browser roles (PostgREST / GraphQL discovery paths).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;