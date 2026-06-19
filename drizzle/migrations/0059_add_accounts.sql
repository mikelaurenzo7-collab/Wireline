-- 0059: Account separation — personal vs business workspaces.
--
-- A user can own up to two accounts (one personal, one business).
-- Agents scope to an account, not directly to a user.
-- Idempotent: all DDL uses IF NOT EXISTS / IF NOT EXISTS guards.

CREATE TABLE IF NOT EXISTS wireline_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES wireline_users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('personal', 'business')),
  label       TEXT,
  is_primary  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_user_type
  ON wireline_accounts USING btree (user_id, type);

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS account_id UUID
  REFERENCES wireline_accounts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agents_account
  ON wireline_agents USING btree (account_id);

-- Backfill: create a "business" account for every existing user and
-- assign their existing agents to it. This is a one-time migration for
-- users who signed up before account separation.
INSERT INTO wireline_accounts (user_id, type, label, is_primary)
SELECT id, 'business', 'My Business', TRUE
FROM wireline_users
WHERE id NOT IN (SELECT user_id FROM wireline_accounts)
ON CONFLICT DO NOTHING;

UPDATE wireline_agents
SET account_id = (
  SELECT wa.id FROM wireline_accounts wa
  WHERE wa.user_id = wireline_agents.user_id
  AND wa.type = 'business'
  LIMIT 1
)
WHERE account_id IS NULL;
