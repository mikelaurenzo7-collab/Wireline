-- Wireline OpenAI-first runtime migration.
-- Existing explicit OpenRouter or Gemini selections remain untouched.
ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai';

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-4o';

UPDATE wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-4o'
WHERE
  COALESCE(voice_llm_provider, '') IN ('', 'anthropic')
  OR COALESCE(voice_llm_model, '') = ''
  OR voice_llm_model LIKE 'claude%';
