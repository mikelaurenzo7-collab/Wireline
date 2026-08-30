-- 0168: make OpenAI Realtime the only live-call voice runtime.
--
-- ElevenLabs remains a separate preview and voice-cloning studio. Presenter
-- voices may remain selected for video, but their phone voice is always one of
-- OpenAI's documented Realtime voices. This migration replaces the historical
-- 0119 trigger that silently rewrote every non-ElevenLabs selection to Vapi.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.wireline_normalize_managed_voice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  default_openai_voice constant text := 'marin';
  openai_voices constant text[] := ARRAY[
    'alloy', 'ash', 'ballad', 'coral', 'echo',
    'sage', 'shimmer', 'verse', 'marin', 'cedar'
  ];
BEGIN
  IF lower(coalesce(NEW.voice_provider, '')) = 'presenter' THEN
    NEW.voice_provider := 'presenter';

    -- A presenter id belongs to the video layer. The phone fallback is always
    -- OpenAI Realtime and must remain valid independently of that presenter.
    NEW.phone_voice_provider := 'openai';
    IF lower(coalesce(NEW.phone_voice_id, '')) <> ALL (openai_voices) THEN
      NEW.phone_voice_id := default_openai_voice;
    ELSE
      NEW.phone_voice_id := lower(NEW.phone_voice_id);
    END IF;
  ELSE
    NEW.voice_provider := 'openai';
    IF lower(coalesce(NEW.voice_id, '')) <> ALL (openai_voices) THEN
      NEW.voice_id := default_openai_voice;
    ELSE
      NEW.voice_id := lower(NEW.voice_id);
    END IF;

    -- These fields are only a presenter-to-phone mapping. A native OpenAI
    -- selection needs no second provider identity.
    NEW.phone_voice_id := NULL;
    NEW.phone_voice_provider := NULL;
  END IF;

  IF NEW.voice_id_inbound IS NOT NULL THEN
    IF lower(NEW.voice_id_inbound) = ANY (openai_voices) THEN
      NEW.voice_id_inbound := lower(NEW.voice_id_inbound);
    ELSE
      NEW.voice_id_inbound := NULL;
    END IF;
  END IF;

  IF NEW.voice_id_outbound IS NOT NULL THEN
    IF lower(NEW.voice_id_outbound) = ANY (openai_voices) THEN
      NEW.voice_id_outbound := lower(NEW.voice_id_outbound);
    ELSE
      NEW.voice_id_outbound := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_agents_managed_voice ON public.wireline_agents;
CREATE TRIGGER wireline_agents_managed_voice
BEFORE INSERT OR UPDATE ON public.wireline_agents
FOR EACH ROW
EXECUTE FUNCTION public.wireline_normalize_managed_voice();

REVOKE ALL ON FUNCTION public.wireline_normalize_managed_voice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_normalize_managed_voice()
  FROM anon, authenticated;

-- Existing Vapi, xAI, and ElevenLabs phone selections become OpenAI Realtime.
-- The trigger performs the normalization under the same rules used for every
-- future write. Presenter rows retain their video selection and receive a
-- deterministic OpenAI phone fallback.
UPDATE public.wireline_agents
SET
  voice_provider = CASE
    WHEN lower(coalesce(voice_provider, '')) = 'presenter' THEN 'presenter'
    ELSE 'openai'
  END,
  voice_id = CASE
    WHEN lower(coalesce(voice_provider, '')) = 'presenter' THEN voice_id
    WHEN lower(coalesce(voice_id, '')) = ANY (ARRAY[
      'alloy', 'ash', 'ballad', 'coral', 'echo',
      'sage', 'shimmer', 'verse', 'marin', 'cedar'
    ]::text[]) THEN lower(voice_id)
    ELSE 'marin'
  END,
  phone_voice_provider = CASE
    WHEN lower(coalesce(voice_provider, '')) = 'presenter' THEN 'openai'
    ELSE NULL
  END,
  phone_voice_id = CASE
    WHEN lower(coalesce(voice_provider, '')) = 'presenter'
      AND lower(coalesce(phone_voice_id, '')) = ANY (ARRAY[
        'alloy', 'ash', 'ballad', 'coral', 'echo',
        'sage', 'shimmer', 'verse', 'marin', 'cedar'
      ]::text[]) THEN lower(phone_voice_id)
    WHEN lower(coalesce(voice_provider, '')) = 'presenter' THEN 'marin'
    ELSE NULL
  END,
  voice_id_inbound = CASE
    WHEN lower(coalesce(voice_id_inbound, '')) = ANY (ARRAY[
      'alloy', 'ash', 'ballad', 'coral', 'echo',
      'sage', 'shimmer', 'verse', 'marin', 'cedar'
    ]::text[]) THEN lower(voice_id_inbound)
    ELSE NULL
  END,
  voice_id_outbound = CASE
    WHEN lower(coalesce(voice_id_outbound, '')) = ANY (ARRAY[
      'alloy', 'ash', 'ballad', 'coral', 'echo',
      'sage', 'shimmer', 'verse', 'marin', 'cedar'
    ]::text[]) THEN lower(voice_id_outbound)
    ELSE NULL
  END;

-- Cloned voices are studio assets only. Revocation therefore clears historical
-- assignments without ever moving a Bot back onto a retired call provider.
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
    voice_provider = CASE WHEN voice_id = revoked_voice_id THEN 'openai' ELSE voice_provider END,
    voice_id = CASE WHEN voice_id = revoked_voice_id THEN 'marin' ELSE voice_id END,
    voice_id_inbound = CASE WHEN voice_id_inbound = revoked_voice_id THEN NULL ELSE voice_id_inbound END,
    voice_id_outbound = CASE WHEN voice_id_outbound = revoked_voice_id THEN NULL ELSE voice_id_outbound END,
    phone_voice_provider = CASE
      WHEN phone_voice_id = revoked_voice_id AND voice_provider = 'presenter' THEN 'openai'
      WHEN phone_voice_id = revoked_voice_id THEN NULL
      ELSE phone_voice_provider
    END,
    phone_voice_id = CASE
      WHEN phone_voice_id = revoked_voice_id AND voice_provider = 'presenter' THEN 'marin'
      WHEN phone_voice_id = revoked_voice_id THEN NULL
      ELSE phone_voice_id
    END
  WHERE user_id = revoked_user_id
    AND (
      voice_id = revoked_voice_id
      OR voice_id_inbound = revoked_voice_id
      OR voice_id_outbound = revoked_voice_id
      OR phone_voice_id = revoked_voice_id
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

REVOKE ALL ON FUNCTION public.wireline_revoke_cloned_voice_assignments() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_revoke_cloned_voice_assignments()
  FROM anon, authenticated;

ALTER TABLE public.wireline_agents
  ALTER COLUMN voice_provider SET DEFAULT 'openai';
ALTER TABLE public.wireline_agents
  ALTER COLUMN voice_id SET DEFAULT 'marin';

ALTER TABLE public.wireline_settings
  ALTER COLUMN voice_llm_provider SET DEFAULT 'openai';
ALTER TABLE public.wireline_settings
  ALTER COLUMN voice_llm_model SET DEFAULT 'gpt-realtime-2.1';

UPDATE public.wireline_settings
SET
  voice_llm_provider = 'openai',
  voice_llm_model = 'gpt-realtime-2.1',
  updated_at = now()
WHERE lower(coalesce(voice_llm_provider, '')) <> 'openai'
   OR lower(coalesce(voice_llm_model, '')) <> 'gpt-realtime-2.1';

COMMENT ON FUNCTION public.wireline_normalize_managed_voice() IS
  'Normalizes every live phone voice to OpenAI Realtime; ElevenLabs remains studio-only.';

RESET lock_timeout;
