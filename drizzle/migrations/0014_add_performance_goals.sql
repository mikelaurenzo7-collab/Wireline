-- Migration: per-tenant monthly performance goals.
--
-- A goal is an operator-set monthly fleet target (e.g. "book 40
-- appointments this month"). Progress is never stored here — the
-- /api/goals route computes the live actual from call logs +
-- appointments scoped to the current calendar month on every read,
-- so a goal is always measured against fresh data.
--
-- One goal per (user_id, metric): POST /api/goals upserts on that
-- unique key. `metric` is validated route-side against the GoalMetric
-- catalog in src/lib/goals.ts (calls_handled | appointments_booked |
-- qualified_leads | voice_minutes).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS wireline_goals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  metric     TEXT NOT NULL,
  target     INTEGER NOT NULL CHECK (target > 0),
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wireline_goals_user_id_metric_key UNIQUE (user_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_goals_user
  ON wireline_goals (user_id);

-- Match the RLS posture of every other wireline_* table. The server
-- connection bypasses RLS (table queries are tenant-scoped in route
-- handlers via req.user.id); enabling RLS here closes the consistency
-- gap so a misused anon key can't reach this table.
ALTER TABLE wireline_goals ENABLE ROW LEVEL SECURITY;
