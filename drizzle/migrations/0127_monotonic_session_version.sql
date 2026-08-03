-- 0127 — monotonic session revocation without cross-host clock assumptions.
--
-- The timestamp added in 0120 remains as a compatibility fallback for tokens
-- minted before this migration. Every new token carries session_version; any
-- password change increments the database-owned counter atomically. Sign-out
-- increments it explicitly in application code.

ALTER TABLE public.wireline_users
  ADD COLUMN IF NOT EXISTS session_version bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.wireline_revoke_sessions_on_password_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
    NEW.session_revoked_before := clock_timestamp();
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_revoke_sessions_on_password_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_revoke_sessions_on_password_change()
  FROM anon, authenticated;

COMMENT ON COLUMN public.wireline_users.session_version IS
  'Monotonic session generation embedded in Wireline JWTs; incrementing revokes all prior sessions without clock comparison.';
