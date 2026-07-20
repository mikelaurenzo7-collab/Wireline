-- Drop the ElevenLabs-backed voice tables.
--
-- The ElevenLabs integration (voice cloning + pronunciation dictionaries) has
-- been removed from the product. Wireline now ships Vapi + xAI Grok voices
-- only. These per-tenant tables are no longer read or written by any code path.
--
-- Cloned voices / pronunciation dictionaries were used by demo accounts only,
-- so there is no customer-data retention concern. Idempotent so it is safe to
-- re-run against a database where the tables are already gone.

DROP TABLE IF EXISTS wireline_cloned_voices;
DROP TABLE IF EXISTS wireline_pronunciation_dictionaries;
