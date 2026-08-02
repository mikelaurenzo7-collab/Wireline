-- 0121 — align the database gate with the consent contract sent by Studio.
--
-- Refuse to relabel older authorization evidence. An operator must review any
-- pre-existing row before this gate can move to a newer consent contract.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.wireline_cloned_voices
    WHERE consent_version <> 'voice-clone-consent-v3-2026-08-01'
  ) THEN
    RAISE EXCEPTION
      'wireline_cloned_voices contains authorization evidence from an older consent contract';
  END IF;
END
$$;

ALTER TABLE public.wireline_cloned_voices
  DROP CONSTRAINT IF EXISTS wireline_cloned_voices_consent_check;

ALTER TABLE public.wireline_cloned_voices
  ADD CONSTRAINT wireline_cloned_voices_consent_check
  CHECK (consent_version = 'voice-clone-consent-v3-2026-08-01');
