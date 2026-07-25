-- Free Builder footgun: wireline_settings.subscription_status defaulted to
-- 'active', so any settings insert that omitted the column silently entitled
-- the tenant for live work (enforceLiveWorkActivation treats active as paid).
-- Align the physical default with signup (`pending_activation`).
-- Idempotent: safe to re-run.

ALTER TABLE wireline_settings
  ALTER COLUMN subscription_status SET DEFAULT 'pending_activation';
