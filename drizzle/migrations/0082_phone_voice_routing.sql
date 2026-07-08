-- Dual-voice routing: presenter for Studio preview, dedicated voice for PSTN.
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS phone_voice_id text;
ALTER TABLE wireline_agents ADD COLUMN IF NOT EXISTS phone_voice_provider text;
