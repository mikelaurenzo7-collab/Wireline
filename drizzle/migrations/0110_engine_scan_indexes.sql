-- Engine-scan indexes for the 5-minute sweep workloads (round-4 audit).
--
-- 1. The callback tick scans globally:
--      WHERE callback_scheduled_at IS NOT NULL AND callback_scheduled_at <= now
--      ORDER BY callback_scheduled_at LIMIT 25
--    The only existing index leads on user_id ((user_id, callback_scheduled_at)
--    partial), which cannot serve a scan with no user predicate — every tick
--    degraded to a full scan of the partial index (or the table) plus a sort,
--    with cost proportional to ALL scheduled callbacks across tenants.
--
-- 2. The sweep's dedup guards (cadence/canary/margin/purge blocks) all query
--      WHERE type = $1 AND created_at >= $2
--    with no covering index — each was a seq scan of an ever-growing
--    wireline_jobs inside the 60s Vercel cron budget.
--
-- Idempotent; safe to re-run. Note per AGENTS.md: merging this file is not the
-- same as applying it — it must also be run against the live database.
CREATE INDEX IF NOT EXISTS idx_leads_callback_due_global
  ON wireline_outbound_leads USING btree (callback_scheduled_at)
  WHERE callback_scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_type_created_at
  ON wireline_jobs USING btree (type, created_at);
