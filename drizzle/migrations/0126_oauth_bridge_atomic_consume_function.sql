-- 0126 — consume an OAuth browser-bridge code without granting table access.
--
-- wireline_oauth_pending_codes deliberately denies wireline_server direct table
-- access. Expose only the one operation the public OAuth exchange needs: an
-- atomic DELETE conditioned on both one-time code hash and initiating-browser
-- state hash, with expiry enforced in the same statement.

CREATE OR REPLACE FUNCTION public.wireline_consume_oauth_pending_code(
  p_code_hash text,
  p_bridge_state_hash text
)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_code_hash IS NULL OR char_length(p_code_hash) <> 64
    OR p_bridge_state_hash IS NULL OR char_length(p_bridge_state_hash) <> 64 THEN
    RETURN;
  END IF;

  RETURN QUERY
  DELETE FROM public.wireline_oauth_pending_codes AS pending
  WHERE pending.code_hash = p_code_hash
    AND pending.bridge_state_hash = p_bridge_state_hash
    AND pending.expires_at > clock_timestamp()
  RETURNING pending.user_id, pending.email, pending.full_name, pending.is_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_consume_oauth_pending_code(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_consume_oauth_pending_code(text, text)
  FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT EXECUTE ON FUNCTION public.wireline_consume_oauth_pending_code(text, text)
      TO wireline_server;
  END IF;
END
$$;

COMMENT ON FUNCTION public.wireline_consume_oauth_pending_code(text, text) IS
  'Atomically consumes one unexpired OAuth bridge code bound to the initiating browser state.';
