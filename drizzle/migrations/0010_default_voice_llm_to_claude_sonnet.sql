-- Default new tenants to Claude Sonnet for deployed voice agents.
-- Runtime assistant creation already falls back to Anthropic/Sonnet when
-- settings are absent; this aligns persisted settings defaults and backfills
-- old untouched Gemini defaults so operators get the higher-quality default
-- unless they explicitly selected Gemini.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'anthropic',
  ALTER COLUMN voice_llm_model SET DEFAULT 'claude-sonnet-4-6';

UPDATE wireline_settings
SET
  voice_llm_provider = 'anthropic',
  voice_llm_model = 'claude-sonnet-4-6',
  updated_at = now()
WHERE
  (voice_llm_provider IS NULL OR voice_llm_provider = 'google')
  AND (voice_llm_model IS NULL OR voice_llm_model = 'gemini-1.5-flash');