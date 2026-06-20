-- OpenAI is Wireline's managed primary runtime. Gemini is the automatic
-- fallback. OpenRouter remains an explicit per-agent operator override.
--
-- Preserve explicit OpenRouter rows; normalize every prior managed default so
-- existing tenants receive the same OpenAI-first policy as new tenants.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai';

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-4o';

UPDATE wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-4o',
  updated_at = NOW()
WHERE
  voice_llm_provider IS NULL
  OR voice_llm_provider <> 'openrouter'
  OR voice_llm_model ILIKE 'claude%'
  OR voice_llm_model ILIKE 'gemini%';

UPDATE wireline_agents
SET
  llm_provider = 'openai',
  llm_model = 'gpt-4o'
WHERE
  llm_provider IS NULL
  OR llm_provider <> 'openrouter'
  OR llm_model ILIKE 'claude%'
  OR llm_model ILIKE 'gemini%';
