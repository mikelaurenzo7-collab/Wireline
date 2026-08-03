-- 0125 — list an authenticated user's shared workspaces with owner labels.
--
-- Membership rows are self-readable, but owner profiles remain isolated in
-- wireline_users. This function exposes only the owner identity needed to label
-- workspaces, and only for active memberships belonging to the authenticated
-- user bound in the transaction-local GUC.

CREATE OR REPLACE FUNCTION public.wireline_list_user_workspaces(p_user_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  role text,
  accepted_at timestamptz,
  owner_email text,
  owner_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  IF public.wireline_current_user_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'authenticated user mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    member.tenant_id,
    member.role,
    member.accepted_at,
    owner.email,
    owner.full_name
  FROM public.wireline_team_members AS member
  JOIN public.wireline_users AS owner ON owner.id = member.tenant_id
  WHERE member.user_id = p_user_id
    AND member.revoked_at IS NULL
    AND member.accepted_at IS NOT NULL
  ORDER BY member.accepted_at DESC, member.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_list_user_workspaces(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_list_user_workspaces(uuid)
  FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT EXECUTE ON FUNCTION public.wireline_list_user_workspaces(uuid)
      TO wireline_server;
  END IF;
END
$$;

COMMENT ON FUNCTION public.wireline_list_user_workspaces(uuid) IS
  'Returns active shared workspace labels for the authenticated Wireline user.';
