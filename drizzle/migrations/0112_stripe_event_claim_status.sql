-- 0112 — Stripe webhook claim reflects completion, not intent.
--
-- wireline_stripe_events was written as a bare idempotency claim BEFORE the
-- handler ran, and deleted again in the JS catch on failure. A killed
-- invocation never runs that catch: Vercel maxDuration while a Stripe read
-- hangs, an OOM, or an instance recycle all leave the claim row behind with
-- none of the work done. Stripe redelivers, the insert raises 23505, and the
-- handler short-circuits to {received:true, duplicate:true} — so a paid
-- credit top-up can be permanently dropped with no ledger row and no trace.
--
-- A status column lets a redelivery tell "already handled" apart from
-- "claimed but never finished".
--
-- Existing rows are backfilled to 'processed': they predate this column and
-- their events were handled under the old delete-on-failure contract, so
-- treating them as complete is the correct (and non-replaying) default.
--
-- Idempotent: safe to re-run (see AGENTS.md).

ALTER TABLE wireline_stripe_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed';

-- Redelivery lookups filter on (event_id, status); event_id is already the PK,
-- so this only needs to cover the sweep for abandoned claims.
CREATE INDEX IF NOT EXISTS idx_stripe_events_status_processed_at
  ON wireline_stripe_events (status, processed_at)
  WHERE status <> 'processed';
