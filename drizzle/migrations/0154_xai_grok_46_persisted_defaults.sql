-- 0154: reconcile the persisted managed structured-runtime default with Grok 4.6.
--
-- Migration 0151 was applied and recorded with xAI/grok-4.3 before the native
-- Twilio + xAI Direct SIP split was completed. Live phone speech now uses the
-- separate `grok-voice-think-fast-2.0` plane; these legacy settings columns
-- describe the managed structured reasoning default and therefore belong on
-- Grok 4.6. Do not rewrite 0151: its applied SQL hash is immutable history.

ALTER TABLE public.wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'xai';

ALTER TABLE public.wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'grok-4.6';

ALTER TABLE public.wireline_agents
  ALTER COLUMN voice_provider SET DEFAULT 'xai';

-- The exact xAI/grok-4.3 pair was the managed backfill written by 0151. Move
-- only that retired pair; explicit Gemini/OpenAI/other selections remain intact.
UPDATE public.wireline_settings
SET
  voice_llm_provider = 'xai',
  voice_llm_model = 'grok-4.6',
  updated_at = now()
WHERE voice_llm_provider = 'xai'
  AND voice_llm_model = 'grok-4.3';
