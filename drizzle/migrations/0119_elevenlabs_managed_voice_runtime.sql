-- 0119 — founder-managed ElevenLabs voices with consent and quality gates.
--
-- Source audio is processed in memory and never stored in Postgres. Only
-- tenant ownership, a SHA-256 fingerprint, authorization evidence, and human
-- review state remain. The agent trigger is the last line of defense: a custom
-- voice cannot enter live PSTN configuration until its row is approved.

CREATE TABLE IF NOT EXISTS public.wireline_cloned_voices (
  voice_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'elevenlabs',
  status text NOT NULL DEFAULT 'creating',
  preview_url text,
  consent_version text NOT NULL,
  source_sha256 text NOT NULL,
  source_mime_type text NOT NULL,
  source_duration_seconds integer NOT NULL,
  intended_use text NOT NULL DEFAULT 'wireline-agents',
  source_audio_retained boolean NOT NULL DEFAULT false,
  isolation_applied boolean NOT NULL DEFAULT false,
  provider_verification_required boolean NOT NULL DEFAULT false,
  quality_check_version text,
  quality_sample_model text,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.wireline_users(id) ON DELETE RESTRICT,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_cloned_voices_provider_check
    CHECK (provider = 'elevenlabs'),
  CONSTRAINT wireline_cloned_voices_name_check
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT wireline_cloned_voices_status_check
    CHECK (status IN ('creating', 'pending_review', 'approved', 'rejected', 'revoked', 'failed', 'deletion_pending')),
  CONSTRAINT wireline_cloned_voices_consent_check
    CHECK (consent_version = 'voice-clone-consent-v1-2026-08-01'),
  CONSTRAINT wireline_cloned_voices_hash_check
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT wireline_cloned_voices_mime_check
    CHECK (source_mime_type IN ('audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/webm')),
  CONSTRAINT wireline_cloned_voices_duration_check
    CHECK (source_duration_seconds BETWEEN 10 AND 90),
  CONSTRAINT wireline_cloned_voices_intended_use_check
    CHECK (intended_use = 'wireline-agents'),
  CONSTRAINT wireline_cloned_voices_source_retention_check
    CHECK (source_audio_retained = false),
  CONSTRAINT wireline_cloned_voices_approval_check
    CHECK (
      status <> 'approved'
      OR (
        approved_at IS NOT NULL
        AND approved_by IS NOT NULL
        AND provider_verification_required = false
        AND quality_check_version = 'voice-quality-v1-2026-08-01'
        AND quality_sample_model = 'eleven_flash_v2_5'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_cloned_voices_user_status_created
  ON public.wireline_cloned_voices USING btree (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cloned_voices_source_fingerprint
  ON public.wireline_cloned_voices USING btree (user_id, source_sha256);

-- The application writes a short-lived `creating` reservation before the
-- provider call. This partial unique index closes the gap between the advisory
-- lock being released and ElevenLabs returning, so concurrent requests cannot
-- spend twice on the same source sample.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cloned_voices_active_source
  ON public.wireline_cloned_voices (user_id, source_sha256)
  WHERE status NOT IN ('revoked', 'failed');

ALTER TABLE public.wireline_cloned_voices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_cloned_voices FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_cloned_voices FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_cloned_voices;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_cloned_voices TO wireline_server;

    CREATE POLICY tenant_isolation
      ON public.wireline_cloned_voices
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.wireline_normalize_managed_voice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  use_elevenlabs boolean := false;
BEGIN
  IF lower(coalesce(NEW.voice_provider, '')) = '11labs' AND NEW.voice_id IS NOT NULL THEN
    use_elevenlabs := NEW.voice_id IN (
      '21m00Tcm4TlvDq8ikWAM',
      'pNInz6obpgDQGcFmaJgB',
      'JBFqnCBsd6RMkjVDRZzb'
    ) OR EXISTS (
      SELECT 1
      FROM public.wireline_cloned_voices voice
      WHERE voice.voice_id = NEW.voice_id
        AND voice.user_id = NEW.user_id
        AND voice.status = 'approved'
    );
  END IF;

  IF use_elevenlabs THEN
    NEW.voice_provider := '11labs';

    IF NEW.voice_id_inbound IS NOT NULL AND NOT (
      NEW.voice_id_inbound IN (
        '21m00Tcm4TlvDq8ikWAM',
        'pNInz6obpgDQGcFmaJgB',
        'JBFqnCBsd6RMkjVDRZzb'
      ) OR EXISTS (
        SELECT 1
        FROM public.wireline_cloned_voices voice
        WHERE voice.voice_id = NEW.voice_id_inbound
          AND voice.user_id = NEW.user_id
          AND voice.status = 'approved'
      )
    ) THEN
      NEW.voice_id_inbound := NULL;
    END IF;

    IF NEW.voice_id_outbound IS NOT NULL AND NOT (
      NEW.voice_id_outbound IN (
        '21m00Tcm4TlvDq8ikWAM',
        'pNInz6obpgDQGcFmaJgB',
        'JBFqnCBsd6RMkjVDRZzb'
      ) OR EXISTS (
        SELECT 1
        FROM public.wireline_cloned_voices voice
        WHERE voice.voice_id = NEW.voice_id_outbound
          AND voice.user_id = NEW.user_id
          AND voice.status = 'approved'
      )
    ) THEN
      NEW.voice_id_outbound := NULL;
    END IF;
  ELSE
    NEW.voice_provider := 'vapi';

    IF NEW.voice_id IS NULL OR NEW.voice_id NOT IN (
      'Savannah', 'Elliot', 'Rohan', 'Emma', 'Clara', 'Nico', 'Kai',
      'Sagar', 'Godfrey', 'Neil', 'Layla', 'Sid', 'Naina'
    ) THEN
      NEW.voice_id := 'Savannah';
    END IF;

    IF NEW.voice_id_inbound IS NOT NULL AND NEW.voice_id_inbound NOT IN (
      'Savannah', 'Elliot', 'Rohan', 'Emma', 'Clara', 'Nico', 'Kai',
      'Sagar', 'Godfrey', 'Neil', 'Layla', 'Sid', 'Naina'
    ) THEN
      NEW.voice_id_inbound := NULL;
    END IF;

    IF NEW.voice_id_outbound IS NOT NULL AND NEW.voice_id_outbound NOT IN (
      'Savannah', 'Elliot', 'Rohan', 'Emma', 'Clara', 'Nico', 'Kai',
      'Sagar', 'Godfrey', 'Neil', 'Layla', 'Sid', 'Naina'
    ) THEN
      NEW.voice_id_outbound := NULL;
    END IF;
  END IF;

  -- Presenter-matched phone voices remain a governed Vapi fallback. Keep
  -- valid mappings intact and reject legacy/external ids. Video presenter
  -- fields are deliberately outside this phone-voice trigger.
  IF lower(coalesce(NEW.phone_voice_provider, '')) = 'vapi'
    AND NEW.phone_voice_id IN (
      'Savannah', 'Elliot', 'Rohan', 'Emma', 'Clara', 'Nico', 'Kai',
      'Sagar', 'Godfrey', 'Neil', 'Layla', 'Sid', 'Naina'
    ) THEN
    NEW.phone_voice_provider := 'vapi';
  ELSE
    NEW.phone_voice_id := NULL;
    NEW.phone_voice_provider := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_agents_managed_voice ON public.wireline_agents;
CREATE TRIGGER wireline_agents_managed_voice
BEFORE INSERT OR UPDATE ON public.wireline_agents
FOR EACH ROW
EXECUTE FUNCTION public.wireline_normalize_managed_voice();

CREATE OR REPLACE FUNCTION public.wireline_revoke_cloned_voice_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  revoked_voice_id text := OLD.voice_id;
  revoked_user_id uuid := OLD.user_id;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'approved' AND NEW.status <> 'approved') THEN
    RETURN NEW;
  END IF;

  UPDATE public.wireline_agents
  SET
    voice_provider = CASE WHEN voice_id = revoked_voice_id THEN 'vapi' ELSE voice_provider END,
    voice_id = CASE WHEN voice_id = revoked_voice_id THEN 'Savannah' ELSE voice_id END,
    voice_id_inbound = CASE WHEN voice_id_inbound = revoked_voice_id THEN NULL ELSE voice_id_inbound END,
    voice_id_outbound = CASE WHEN voice_id_outbound = revoked_voice_id THEN NULL ELSE voice_id_outbound END
  WHERE user_id = revoked_user_id
    AND voice_provider = '11labs'
    AND (
      voice_id = revoked_voice_id
      OR voice_id_inbound = revoked_voice_id
      OR voice_id_outbound = revoked_voice_id
    );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_cloned_voice_revocation
  ON public.wireline_cloned_voices;
CREATE TRIGGER wireline_cloned_voice_revocation
AFTER UPDATE OF status OR DELETE ON public.wireline_cloned_voices
FOR EACH ROW
EXECUTE FUNCTION public.wireline_revoke_cloned_voice_assignments();

REVOKE ALL ON FUNCTION public.wireline_normalize_managed_voice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_normalize_managed_voice() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.wireline_revoke_cloned_voice_assignments() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_revoke_cloned_voice_assignments() FROM anon, authenticated;

COMMENT ON TABLE public.wireline_cloned_voices IS
  'Tenant-owned ElevenLabs voices; source audio is not retained and live use requires human approval.';
