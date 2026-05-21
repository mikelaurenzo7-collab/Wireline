-- Default new tenants to OpenAI GPT-4o for live voice agents.
-- Claude remains the supervisory/written-communication layer, but the
-- realtime phone runtime now uses GPT-4o first with Gemini as fallback.
-- Backfill only old/default Anthropic and legacy OpenAI-mini rows so we
-- do not overwrite tenants that explicitly chose Gemini.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai',
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-4o';

UPDATE wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-4o',
  updated_at = now()
WHERE
  (
    voice_llm_provider IS NULL
    OR voice_llm_provider = 'anthropic'
    OR voice_llm_provider = 'openai'
  )
  AND (
    voice_llm_model IS NULL
    OR voice_llm_model IN (
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-7',
      'gpt-4.1-mini'
    )
  );
