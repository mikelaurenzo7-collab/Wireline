-- Gemini is Wireline's managed primary runtime. OpenRouter remains an explicit
-- per-agent override; OpenAI is the runtime fallback and is not selected as a
-- default tenant model.
--
-- Preserve explicit OpenRouter selections. Normalize only retired or stale
-- Anthropic / xAI / direct OpenAI managed defaults so old rows cannot revive a
-- provider path that is no longer part of the product policy.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'google';

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gemini-3.5-flash';

UPDATE wireline_settings
SET
  voice_llm_provider = 'google',
  voice_llm_model = 'gemini-3.5-flash',
  updated_at = NOW()
WHERE
  voice_llm_provider IS NULL
  OR voice_llm_provider IN ('anthropic', 'openai', 'xai')
  OR voice_llm_model ILIKE 'claude%';

UPDATE wireline_agents
SET
  llm_provider = 'google',
  llm_model = 'gemini-3.5-flash'
WHERE
  llm_provider IN ('anthropic', 'openai', 'xai')
  OR llm_model ILIKE 'claude%';
