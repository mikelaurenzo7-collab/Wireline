-- Per-agent video presenter (LiveAvatar / HeyGen LITE) configuration.
ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS video_presenter_provider text,
  ADD COLUMN IF NOT EXISTS video_presenter_avatar_id text,
  ADD COLUMN IF NOT EXISTS video_presenter_consent_status text DEFAULT 'not_started';

-- Existing business agents inherit the live presenter policy.
UPDATE wireline_agents
SET video_presenter_provider = 'liveavatar'
WHERE is_business_agent = true
  AND video_presenter_provider IS NULL;
