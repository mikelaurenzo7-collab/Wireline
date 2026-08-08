-- Durable lease for the daily-brief cron dispatcher.
--
-- Vercel cron can overlap/retry. This lease lets one invocation claim a
-- tenant without abusing daily_brief_last_sent_at as an attempt marker.
-- last_attempt_at is an at-most-once latch for the day's Gmail delivery; it is
-- reset only for known failures before provider acceptance. The application
-- reclaims a stale lease on a later scheduled day.
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS daily_brief_dispatch_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS daily_brief_last_attempt_at timestamptz;
