-- Migration: Agent business-profile fields
-- Date: 2026-05-07
--
-- Adds the universal business-context fields every agent needs across
-- verticals (solopreneur services, mid-market sales, enterprise contact
-- centers, e-commerce, healthcare, real estate, hospitality):
--
--   business_hours        — when the agent should engage vs route
--                           to voicemail / out-of-hours flow.
--   timezone              — IANA tz used to evaluate hours.
--   compliance_mode       — opt-in compliance preset that auto-injects
--                           required disclosures (HIPAA / PCI / GDPR /
--                           financial / legal / none).
--   disallowed_topics     — soft guardrails: topics the agent must
--                           refuse to discuss (e.g. medical advice,
--                           legal opinions, competitor names).
--   escalation_keywords   — phrases that trigger immediate human handoff
--                           regardless of normal escalation thresholds.
--   business_variables    — key/value placeholders ({business_name},
--                           {hours}, {website}) that can be referenced
--                           anywhere in personality / directives /
--                           knowledge and get expanded at runtime.
--   out_of_hours_message  — message read when the call lands outside
--                           business hours, before voicemail handoff.
--   kpi_focus             — which outcome metric the agent optimizes for
--                           (general | conversions | qualifications |
--                            resolutions | satisfaction). Surfaces in
--                           per-agent reporting.
--
-- All columns nullable / default-empty so existing agents keep working
-- with no behavior change until an operator opts in.

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS business_hours       jsonb       DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone             text        DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS compliance_mode      text        DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS disallowed_topics    text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS escalation_keywords  text[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS business_variables   jsonb       DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS out_of_hours_message text,
  ADD COLUMN IF NOT EXISTS kpi_focus            text        DEFAULT 'general';

-- Constrain compliance_mode to known presets; unknown values are
-- silently treated as 'none' at the application layer, but storing
-- arbitrary strings would defeat the dashboard segmentation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wireline_agents_compliance_mode_check'
  ) THEN
    ALTER TABLE wireline_agents
      ADD CONSTRAINT wireline_agents_compliance_mode_check
      CHECK (compliance_mode IN ('none','hipaa','pci','gdpr','financial','legal'));
  END IF;
END $$;

-- Same idea for kpi_focus — used to colorize per-agent dashboards.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wireline_agents_kpi_focus_check'
  ) THEN
    ALTER TABLE wireline_agents
      ADD CONSTRAINT wireline_agents_kpi_focus_check
      CHECK (kpi_focus IN ('general','conversions','qualifications','resolutions','satisfaction'));
  END IF;
END $$;

-- Index on (user_id, compliance_mode) — supports "show me my HIPAA
-- agents" filters in the fleet dashboard.
CREATE INDEX IF NOT EXISTS wireline_agents_user_compliance_idx
  ON wireline_agents(user_id, compliance_mode);
