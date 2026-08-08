-- 0137 — per-tenant email-sync keys and cadence re-enrollment.
--
-- 1) wireline_email_threads.thread_id and wireline_email_messages
--    .google_message_id were globally unique. External thread/message ids are
--    sender- or provider-chosen, so the same email delivered to two tenants'
--    mailboxes carries the same key in both: the second tenant's sync upsert
--    collides with the first tenant's (RLS-invisible) row and the whole sync
--    transaction fails — a repeatable, externally-triggerable broken inbox —
--    while the message-level DO NOTHING silently discards the second tenant's
--    copy. Ownership was never part of the key; make both uniques composite
--    with user_id. Loosening a global unique to per-tenant cannot be blocked
--    by existing data (verified against the live database 2026-08-07: both
--    old uniques exist exactly as named below and no composite duplicates are
--    possible under them).
--
-- 2) idx_cadence_runs_lead_unique was a full unique on (lead_id, cadence_id)
--    and runs are never deleted, so after a run completed/failed/paused the
--    lead could never be re-enrolled in that cadence (409 forever). Only one
--    ACTIVE run per (lead, cadence) is the real invariant; scope the index.
--
-- Idempotent and safe to replay.

ALTER TABLE public.wireline_email_threads
  DROP CONSTRAINT IF EXISTS wireline_email_threads_thread_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_threads_user_thread
  ON public.wireline_email_threads (user_id, thread_id);

ALTER TABLE public.wireline_email_messages
  DROP CONSTRAINT IF EXISTS wireline_email_messages_google_message_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_messages_user_google_message
  ON public.wireline_email_messages (user_id, google_message_id);

DROP INDEX IF EXISTS idx_cadence_runs_lead_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cadence_runs_lead_unique
  ON public.wireline_cadence_runs (lead_id, cadence_id)
  WHERE status = 'active';
