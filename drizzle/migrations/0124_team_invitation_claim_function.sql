-- 0124 — claim a team invitation across tenant boundaries without weakening RLS.
--
-- Pending invitations belong to the owner's tenant and have user_id NULL. The
-- invitee therefore cannot UPDATE them through ordinary tenant policies. This
-- narrowly scoped SECURITY DEFINER function validates the signed-in identity
-- against the transaction-local Wireline user GUC, binds the invite to the
-- matching email, and consumes the token atomically.

CREATE OR REPLACE FUNCTION public.wireline_accept_team_invitation(
  p_token_hash text,
  p_accepting_user_id uuid,
  p_accepting_email text
)
RETURNS TABLE(id uuid, tenant_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) <> 64 THEN
    RETURN;
  END IF;

  IF public.wireline_current_user_id() IS DISTINCT FROM p_accepting_user_id THEN
    RAISE EXCEPTION 'authenticated user mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.wireline_team_members AS member
  SET user_id = p_accepting_user_id,
      accepted_at = clock_timestamp(),
      invitation_token_hash = NULL,
      invitation_expires_at = NULL
  WHERE member.invitation_token_hash = p_token_hash
    AND member.invitation_expires_at >= clock_timestamp()
    AND member.revoked_at IS NULL
    AND member.user_id IS NULL
    AND lower(member.email) = lower(p_accepting_email)
  RETURNING member.id, member.tenant_id, member.role;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_accept_team_invitation(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_accept_team_invitation(text, uuid, text)
  FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT EXECUTE ON FUNCTION public.wireline_accept_team_invitation(text, uuid, text)
      TO wireline_server;
  END IF;
END
$$;

COMMENT ON FUNCTION public.wireline_accept_team_invitation(text, uuid, text) IS
  'Atomically consumes an email-bound team invitation for the authenticated Wireline user.';
