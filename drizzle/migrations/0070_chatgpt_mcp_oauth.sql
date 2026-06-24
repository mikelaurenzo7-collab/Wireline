-- 0070: OAuth authorization-code and token records for the Wireline ChatGPT App.
--
-- Tokens and authorization codes are stored only as HMAC hashes. Plaintext values
-- are returned once to the OAuth client and are never persisted in Postgres.
-- This surface does not grant anon/authenticated database roles any access.

CREATE TABLE IF NOT EXISTS wireline_mcp_oauth_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  scope text NOT NULL,
  code_challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wireline_mcp_access_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL,
  client_id text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wireline_mcp_refresh_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL,
  client_id text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires
  ON wireline_mcp_access_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_refresh_tokens_expires
  ON wireline_mcp_refresh_tokens (expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON wireline_mcp_oauth_codes, wireline_mcp_access_tokens, wireline_mcp_refresh_tokens FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON wireline_mcp_oauth_codes, wireline_mcp_access_tokens, wireline_mcp_refresh_tokens FROM authenticated;
  END IF;
END $$;
