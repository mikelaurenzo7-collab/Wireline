ALTER TABLE wireline_settings
ALTER COLUMN voice_llm_provider SET DEFAULT 'google';

ALTER TABLE wireline_settings
ALTER COLUMN voice_llm_model SET DEFAULT 'gemini-3-flash-preview';

UPDATE wireline_settings
SET
  voice_llm_provider = 'google',
  voice_llm_model = 'gemini-3-flash-preview'
WHERE COALESCE(voice_llm_provider, '') IN ('', 'openai', 'anthropic')
  AND COALESCE(voice_llm_model, '') IN (
    '',
    'gpt-4o',
    'gemini-2.5-flash',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-3-5-sonnet-20241022'
  );