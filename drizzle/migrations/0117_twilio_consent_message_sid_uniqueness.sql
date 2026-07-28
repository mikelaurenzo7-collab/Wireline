-- 0117 — database backstop for Twilio consent webhook idempotency.
--
-- The application serializes consent changes per tenant + consumer and checks
-- MessageSid before writing. A unique partial expression index makes that
-- compliance invariant survive future route refactors, concurrent workers, or
-- an accidental loss of the advisory lock.
--
-- Existing production data was checked for duplicates before this migration.
-- Idempotent and safe to replay.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_log_twilio_message_sid
  ON public.wireline_consent_log (
    user_id,
    ((metadata ->> 'twilio_message_sid'))
  )
  WHERE NULLIF(metadata ->> 'twilio_message_sid', '') IS NOT NULL;
