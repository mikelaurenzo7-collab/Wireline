-- 0122 — align team-member RLS with shared workspace tenancy.
--
-- The legacy policy isolated rows on user_id. That made accepted members able to
-- see their own row, but it prevented workspace owners from inserting pending
-- invitations (user_id is NULL) and from listing/managing the workspace roster.
-- Wireline's request context stores the active workspace owner id in
-- app.current_user_id, so management must scope to tenant_id. A separate
-- SELECT-only policy preserves a member's ability to discover their own
-- memberships from their personal context without granting mutation rights.

ALTER TABLE public.wireline_team_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_team_members FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_team_members FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_team_members;
DROP POLICY IF EXISTS workspace_manage ON public.wireline_team_members;
DROP POLICY IF EXISTS membership_self_read ON public.wireline_team_members;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_team_members TO wireline_server;

    CREATE POLICY workspace_manage
      ON public.wireline_team_members
      FOR ALL TO wireline_server
      USING (tenant_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (tenant_id = (SELECT public.wireline_current_user_id()));

    CREATE POLICY membership_self_read
      ON public.wireline_team_members
      FOR SELECT TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

COMMENT ON TABLE public.wireline_team_members IS
  'Workspace roster and pending invitations; tenant owners manage by tenant_id while members may read only their own memberships.';
