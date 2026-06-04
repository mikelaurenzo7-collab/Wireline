-- 0030: Supabase security audit hardening (prod applied via MCP 2026-06-03)
--
-- Fixes:
--   - wireline_organizations always-true RLS policy
--   - wireline_agent_team_members missing user_id + policy (0026 drift)
--   - wireline_director_profile missing tenant_isolation policy
--   - REVOKE anon grants on wireline_* (app uses POSTGRES_URL, not anon key)
--   - notify_presence_change search_path pinned

-- 1) Fix wireline_organizations permissive always-true RLS policy
DROP POLICY IF EXISTS "tenant_isolation" ON wireline_organizations;
CREATE POLICY "tenant_isolation" ON wireline_organizations
  FOR ALL
  USING (
    owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1 FROM wireline_memberships m
      WHERE m.organization_id = wireline_organizations.id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    owner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- 2) wireline_agent_team_members: add user_id + tenant isolation
ALTER TABLE IF EXISTS wireline_agent_team_members
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE wireline_agent_team_members m
SET user_id = t.user_id
FROM wireline_agent_teams t
WHERE m.team_id = t.id
  AND m.user_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM wireline_agent_team_members WHERE user_id IS NULL) THEN
    EXECUTE 'ALTER TABLE wireline_agent_team_members ALTER COLUMN user_id SET NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_team_members_user_id
  ON wireline_agent_team_members (user_id);

ALTER TABLE wireline_agent_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON wireline_agent_team_members;
CREATE POLICY "tenant_isolation" ON wireline_agent_team_members
  FOR ALL
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- 3) wireline_director_profile tenant isolation
DROP POLICY IF EXISTS "tenant_isolation" ON wireline_director_profile;
CREATE POLICY "tenant_isolation" ON wireline_director_profile
  FOR ALL
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

-- 4) Server-only tables: oauth bridge has no RLS (postgres role only).
--    stripe_events stays RLS-enabled with no tenant policies (fail-closed).
ALTER TABLE IF EXISTS wireline_oauth_pending_codes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wireline_stripe_events ENABLE ROW LEVEL SECURITY;

-- 5) Remove anon role grants (Wireline does not use supabase-js / anon key)
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'wireline_%'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
  END LOOP;
END $$;

-- 6) Pin search_path on presence trigger function
CREATE OR REPLACE FUNCTION notify_presence_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify(
    'presence_change',
    json_build_object(
      'userId', COALESCE(NEW.user_id, OLD.user_id),
      'action', TG_OP
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 7) Revoke public RPC on Supabase internal helper (not used by Wireline)
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
