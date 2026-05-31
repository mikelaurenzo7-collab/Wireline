-- 0026: tenant-isolation hardening + cross-instance OAuth bridge codes.
--
-- Two unrelated-but-small changes batched into one migration because
-- both are tiny DDL adds:
--
-- (1) wireline_agent_team_members gains a `user_id` column + tenant-
--     isolation RLS policy. Previously the table was scoped only via
--     the team_id FK, but as soon as a route queries it directly
--     (without joining through wireline_agent_teams) RLS has nothing
--     to enforce. Tracked as "Add RLS policy / user_id for
--     wireline_agent_team_members before it's queried directly."
--
-- (2) wireline_oauth_pending_codes is the new persistent backing
--     store for the OAuth sign-in bridge. The previous in-process
--     Map worked locally but lost state across Vercel function
--     invocations (cold start, scale-out → second instance), causing
--     /api/auth/oauth/exchange to return "Invalid or expired code"
--     on any deploy that wasn't single-instance + warm. Rows are
--     short-lived (60s) and cleaned up opportunistically on read.

-- ───── (1) wireline_agent_team_members.user_id + RLS ─────

ALTER TABLE IF EXISTS wireline_agent_team_members
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill user_id from the parent team. Safe on empty tables.
UPDATE wireline_agent_team_members m
SET user_id = t.user_id
FROM wireline_agent_teams t
WHERE m.team_id = t.id
  AND m.user_id IS NULL;

-- Make NOT NULL only if backfill left no orphans (defense for partial
-- legacy data with broken FK refs).
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

-- ───── (2) wireline_oauth_pending_codes ─────

CREATE TABLE IF NOT EXISTS wireline_oauth_pending_codes (
  code text PRIMARY KEY,
  -- The pre-minted Wireline JWT we'll hand back to the SPA on exchange.
  token text NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  is_owner boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_codes_expires_at
  ON wireline_oauth_pending_codes (expires_at);

-- Intentionally NOT enabling RLS: this table is written + read by the
-- OAuth callback itself, which runs unauthenticated (the JWT hasn't
-- been handed to the browser yet). The `code` value is a 256-bit
-- random nonce and is the only credential needed to redeem the row.
