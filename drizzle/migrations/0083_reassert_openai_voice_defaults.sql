-- Reassert Wireline's OpenAI-native managed voice runtime defaults.
--
-- Production had already received later feature schema changes, but Drizzle's
-- journaled migration history stopped before the OpenAI default repairs. This
-- migration is intentionally narrow and idempotent: new settings rows default
-- to OpenAI/GPT-4o, and only exact retired managed defaults are backfilled.

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai';

ALTER TABLE wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-4o';

UPDATE wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-4o',
  updated_at = now()
WHERE
  voice_llm_provider IS NULL
  OR voice_llm_model IS NULL
  OR (voice_llm_provider = 'google' AND voice_llm_model IN ('gemini-3-flash-preview', 'gemini-3.5-flash'))
  OR (voice_llm_provider = 'anthropic' AND voice_llm_model IN ('claude-haiku-4-5', 'claude-sonnet-4-6'));
