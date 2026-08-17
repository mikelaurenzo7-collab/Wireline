-- Promote Wireline's managed defaults to xAI.
--
-- Structured reasoning uses Grok 4.6 on the xAI Responses API. Live PSTN
-- uses Vapi's published xAI language model grok-4.3 (Grok 4.6 is not in
-- Vapi's catalog) plus xAI Eve/Ara/Rex/Sal/Leo voices.
--
-- This migration is intentionally narrow and idempotent: new settings rows
-- default to xAI/grok-4.3, and only the previous managed default pair
-- (openai + gpt-4o) is backfilled. Explicit Gemini, OpenAI custom, or other
-- complete (provider, model) selections remain untouched.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'xai';

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'grok-4.3';

ALTER TABLE wireline_agents
  ALTER COLUMN voice_provider SET DEFAULT 'xai';

UPDATE wireline_settings
SET
  voice_llm_provider = 'xai',
  voice_llm_model = 'grok-4.3',
  updated_at = now()
WHERE
  voice_llm_provider IS NULL
  OR voice_llm_model IS NULL
  OR (voice_llm_provider = 'openai' AND voice_llm_model = 'gpt-4o');
