-- 0144 — make account deletion authoritative for every user-bound auth artifact.
--
-- Live verification on 2026-08-11 found that none of Wireline's password,
-- verification, MCP OAuth-code, MCP access-token, MCP refresh-token, or OAuth
-- pending-code tables had a foreign key to wireline_users. Deleted QA users had
-- therefore left 12 expired password-reset hashes and 24 expired email-
-- verification hashes behind. The MCP tables had no current orphans, but shared
-- the same structural gap; 16 expired MCP authorization codes also remained
-- because no later token issuance had triggered the existing opportunistic prune.
--
-- Delete only rows whose owner is already gone, clear already-expired MCP
-- artifacts, then install ON DELETE CASCADE ownership for every user-bound auth
-- artifact. Active rows owned by existing users are untouched. Child-side
-- user_id indexes keep cascades bounded as these tables grow; password-reset and
-- email-verification already have them. The OAuth-code expiry index makes the
-- existing pruneExpiredMcpOAuthRows() contract true for all three MCP tables.

DELETE FROM public.wireline_password_reset_tokens AS token
WHERE NOT EXISTS (
  SELECT 1 FROM public.wireline_users AS users WHERE users.id = token.user_id
);

DELETE FROM public.wireline_email_verification_tokens AS token
WHERE NOT EXISTS (
  SELECT 1 FROM public.wireline_users AS users WHERE users.id = token.user_id
);

DELETE FROM public.wireline_mcp_oauth_codes AS token
WHERE token.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = token.user_id
  );

DELETE FROM public.wireline_mcp_access_tokens AS token
WHERE token.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = token.user_id
  );

DELETE FROM public.wireline_mcp_refresh_tokens AS token
WHERE token.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = token.user_id
  );

DELETE FROM public.wireline_oauth_pending_codes AS token
WHERE token.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = token.user_id
  );

-- Clear expired MCP credentials/codes once now. Future issuance already invokes
-- pruneExpiredMcpOAuthRows(), so inactivity cannot create new expired rows and
-- subsequent activity cleans whatever has aged out since the prior issuance.
DELETE FROM public.wireline_mcp_oauth_codes WHERE expires_at < now();
DELETE FROM public.wireline_mcp_access_tokens WHERE expires_at < now();
DELETE FROM public.wireline_mcp_refresh_tokens WHERE expires_at < now();

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_user_id
  ON public.wireline_mcp_oauth_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_user_id
  ON public.wireline_mcp_access_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_refresh_tokens_user_id
  ON public.wireline_mcp_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_pending_codes_user_id
  ON public.wireline_oauth_pending_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires_at
  ON public.wireline_mcp_oauth_codes (expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_password_reset_tokens_user_id_fkey'
      AND conrelid = 'public.wireline_password_reset_tokens'::regclass
  ) THEN
    ALTER TABLE public.wireline_password_reset_tokens
      ADD CONSTRAINT wireline_password_reset_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_email_verification_tokens_user_id_fkey'
      AND conrelid = 'public.wireline_email_verification_tokens'::regclass
  ) THEN
    ALTER TABLE public.wireline_email_verification_tokens
      ADD CONSTRAINT wireline_email_verification_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_mcp_oauth_codes_user_id_fkey'
      AND conrelid = 'public.wireline_mcp_oauth_codes'::regclass
  ) THEN
    ALTER TABLE public.wireline_mcp_oauth_codes
      ADD CONSTRAINT wireline_mcp_oauth_codes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_mcp_access_tokens_user_id_fkey'
      AND conrelid = 'public.wireline_mcp_access_tokens'::regclass
  ) THEN
    ALTER TABLE public.wireline_mcp_access_tokens
      ADD CONSTRAINT wireline_mcp_access_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_mcp_refresh_tokens_user_id_fkey'
      AND conrelid = 'public.wireline_mcp_refresh_tokens'::regclass
  ) THEN
    ALTER TABLE public.wireline_mcp_refresh_tokens
      ADD CONSTRAINT wireline_mcp_refresh_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_oauth_pending_codes_user_id_fkey'
      AND conrelid = 'public.wireline_oauth_pending_codes'::regclass
  ) THEN
    ALTER TABLE public.wireline_oauth_pending_codes
      ADD CONSTRAINT wireline_oauth_pending_codes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;
END
$$;