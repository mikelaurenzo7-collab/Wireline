-- Browser extension handoff contexts are stored server-side behind an opaque
-- one-time id. Studio URLs only carry `handoff_id`; captured page context stays
-- encrypted in Postgres until redeemed or expired.

CREATE TABLE IF NOT EXISTS wireline_browser_handoffs (
  id_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  context_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_browser_handoffs_user_expires
  ON wireline_browser_handoffs (user_id, expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON wireline_browser_handoffs FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON wireline_browser_handoffs FROM authenticated;
  END IF;
END $$;

ALTER TABLE wireline_browser_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_direct_api_access ON wireline_browser_handoffs;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY deny_direct_api_access
      ON wireline_browser_handoffs
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
