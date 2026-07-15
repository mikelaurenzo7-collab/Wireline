-- Wireline launch voice policy: one managed Vapi voice runtime.
--
-- Premium/external voice and video-presenter adapters remain in the codebase for
-- future, separately priced experiments, but authenticated creation and updates
-- cannot silently opt a tenant into those providers or their billing surfaces.

CREATE OR REPLACE FUNCTION wireline_normalize_managed_voice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.voice_provider := 'vapi';

  IF NEW.voice_id IS NULL OR NEW.voice_id NOT IN (
    'Savannah', 'Elliot', 'Emma', 'Clara', 'Nico', 'Sid', 'Layla', 'Neil'
  ) THEN
    NEW.voice_id := 'Savannah';
  END IF;

  IF NEW.voice_id_inbound IS NOT NULL AND NEW.voice_id_inbound NOT IN (
    'Savannah', 'Elliot', 'Emma', 'Clara', 'Nico', 'Sid', 'Layla', 'Neil'
  ) THEN
    NEW.voice_id_inbound := NULL;
  END IF;

  IF NEW.voice_id_outbound IS NOT NULL AND NEW.voice_id_outbound NOT IN (
    'Savannah', 'Elliot', 'Emma', 'Clara', 'Nico', 'Sid', 'Layla', 'Neil'
  ) THEN
    NEW.voice_id_outbound := NULL;
  END IF;

  NEW.phone_voice_id := NULL;
  NEW.phone_voice_provider := NULL;
  NEW.video_presenter_provider := NULL;
  NEW.video_presenter_avatar_id := NULL;
  NEW.video_presenter_consent_status := 'not_started';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_agents_managed_voice ON wireline_agents;
CREATE TRIGGER wireline_agents_managed_voice
BEFORE INSERT OR UPDATE ON wireline_agents
FOR EACH ROW
EXECUTE FUNCTION wireline_normalize_managed_voice();

-- Normalize current demo/legacy rows before the simplified runtime is activated.
UPDATE wireline_agents
SET
  voice_provider = 'vapi',
  voice_id = CASE
    WHEN voice_id IN ('Savannah', 'Elliot', 'Emma', 'Clara', 'Nico', 'Sid', 'Layla', 'Neil')
      THEN voice_id
    ELSE 'Savannah'
  END,
  voice_id_inbound = CASE
    WHEN voice_id_inbound IN ('Savannah', 'Elliot', 'Emma', 'Clara', 'Nico', 'Sid', 'Layla', 'Neil')
      THEN voice_id_inbound
    ELSE NULL
  END,
  voice_id_outbound = CASE
    WHEN voice_id_outbound IN ('Savannah', 'Elliot', 'Emma', 'Clara', 'Nico', 'Sid', 'Layla', 'Neil')
      THEN voice_id_outbound
    ELSE NULL
  END,
  phone_voice_id = NULL,
  phone_voice_provider = NULL,
  video_presenter_provider = NULL,
  video_presenter_avatar_id = NULL,
  video_presenter_consent_status = 'not_started';
