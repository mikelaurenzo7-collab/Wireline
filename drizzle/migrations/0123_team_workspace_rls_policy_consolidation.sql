-- 0123 — consolidate team workspace RLS into one SELECT predicate.
--
-- Migration 0122 used an ALL workspace policy plus a member self-read policy.
-- PostgreSQL therefore evaluated two permissive SELECT policies. Keep the same
-- access model with one SELECT policy and action-specific owner mutations.

DROP POLICY IF EXISTS workspace_manage ON public.wireline_team_members;
DROP POLICY IF EXISTS membership_self_read ON public.wireline_team_members;
DROP POLICY IF EXISTS workspace_read ON public.wireline_team_members;
DROP POLICY IF EXISTS workspace_insert ON public.wireline_team_members;
DROP POLICY IF EXISTS workspace_update ON public.wireline_team_members;
DROP POLICY IF EXISTS workspace_delete ON public.wireline_team_members;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    CREATE POLICY workspace_read
      ON public.wireline_team_members
      FOR SELECT TO wireline_server
      USING (
        tenant_id = (SELECT public.wireline_current_user_id())
        OR user_id = (SELECT public.wireline_current_user_id())
      );

    CREATE POLICY workspace_insert
      ON public.wireline_team_members
      FOR INSERT TO wireline_server
      WITH CHECK (tenant_id = (SELECT public.wireline_current_user_id()));

    CREATE POLICY workspace_update
      ON public.wireline_team_members
      FOR UPDATE TO wireline_server
      USING (tenant_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (tenant_id = (SELECT public.wireline_current_user_id()));

    CREATE POLICY workspace_delete
      ON public.wireline_team_members
      FOR DELETE TO wireline_server
      USING (tenant_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;
