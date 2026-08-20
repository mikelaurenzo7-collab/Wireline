-- 0156: restore OpenAI-first runtime cohesion without changing production PSTN.
--
-- `wireline_settings.voice_llm_*` is legacy naming for the provider/model pair
-- consumed by the rollback-only Vapi assistant factory. It does not select the
-- structured reasoning runtime, and it must not contain Grok 4.6: that model is
-- available on xAI's Responses API but is not a Vapi live-call language model.
-- Structured reasoning is governed in application policy and defaults to
-- OpenAI GPT-5.6 Terra. Browser Studio uses OpenAI Realtime. Production PSTN
-- remains Twilio + xAI Direct SIP and `wireline_agents.voice_provider` is
-- intentionally untouched by this migration.

ALTER TABLE public.wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai';

ALTER TABLE public.wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-4o';

-- Migration 0154 wrote this exact invalid Vapi pair as the managed default.
-- Move only that pair; preserve every explicit supported tenant selection.
UPDATE public.wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-4o',
  updated_at = now()
WHERE voice_llm_provider = 'xai'
  AND voice_llm_model = 'grok-4.6';
