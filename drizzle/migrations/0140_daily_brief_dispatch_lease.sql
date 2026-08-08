-- Durable lease for the daily-brief cron dispatcher.
--
-- Vercel cron can overlap/retry. This lease lets one invocation claim a
-- tenant without abusing daily_brief_last_sent_at as an attempt marker.
-- The application reclaims leases older than its function execution ceiling.
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS daily_brief_dispatch_claimed_at timestamptz;
