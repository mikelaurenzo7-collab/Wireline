-- Per-agent reasoning-model override (customization-first Agent Studio).
--
-- NULL on any column → the agent inherits the tenant default
-- (wireline_settings.voice_llm_provider / voice_llm_model) and the
-- archetype's temperature, identical to pre-migration behaviour. When set,
-- the voice factory routes the live call through this provider/model.
-- Values are validated + normalized by resolveVapiVoiceModelSelection()
-- against the Vapi-native provider set (anthropic | google | openai | xai |
-- openrouter); llm_temperature is clamped to a safe range in the factory.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so this is safe to re-run.

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS llm_provider TEXT;

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS llm_model TEXT;

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS llm_temperature NUMERIC(3, 2);
