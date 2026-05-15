-- Migration: Add missing columns referenced by route handlers.
-- - emailThreads.read (BOOLEAN) — sidebar nav badge counts unread threads via
--   /api/nav-counts; the route was querying a non-existent column and silently
--   returning 0 from its catch-all.
-- - emailThreads.agentId (TEXT, FK -> wireline_agents.id) — Claude qualify,
--   smart-reply, and post-call analysis routes look up the owning agent from
--   the thread; the column reference resolved to undefined at runtime.

ALTER TABLE wireline_email_threads
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE wireline_email_threads
  ADD COLUMN IF NOT EXISTS agent_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'wireline_email_threads'
      AND constraint_name = 'wireline_email_threads_agent_id_fkey'
  ) THEN
    ALTER TABLE wireline_email_threads
      ADD CONSTRAINT wireline_email_threads_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES wireline_agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_threads_user_read
  ON wireline_email_threads USING btree (user_id, read);

CREATE INDEX IF NOT EXISTS idx_email_threads_agent_id
  ON wireline_email_threads USING btree (agent_id);
