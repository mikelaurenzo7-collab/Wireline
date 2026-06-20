-- Wireline runtime policy: OpenAI is the managed primary, Gemini is the native fallback.
-- Preserve explicit OpenRouter choices; only normalize retired Anthropic/Claude defaults.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai';

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-4o';

UPDATE wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-4o'
WHERE
  lower(coalesce(voice_llm_provider, '')) IN ('anthropic', 'claude')
  OR lower(coalesce(voice_llm_model, '')) LIKE 'claude%';

-- Per-agent legacy overrides should inherit the corrected tenant default.
-- Explicit OpenAI, Gemini, and OpenRouter selections remain unchanged.
UPDATE wireline_agents
SET
  llm_provider = NULL,
  llm_model = NULL
WHERE
  lower(coalesce(llm_provider, '')) IN ('anthropic', 'claude')
  OR lower(coalesce(llm_model, '')) LIKE 'claude%';
