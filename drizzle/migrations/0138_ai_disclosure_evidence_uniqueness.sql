-- 0138 — per-call uniqueness for AI-identity disclosure evidence.
--
-- FCC 24-17 classifies an AI-generated voice as an "artificial or prerecorded
-- voice" under the TCPA. complianceFirstMessagePrefix() injects the AI
-- disclosure into every outbound AI call, but injection is not delivery:
-- persistAiDisclosureEvidence now records per-call evidence that the
-- disclosure was actually spoken, so the consent ledger can defend the call.
--
-- This is its own event family with its own partial unique index. Reusing
-- 0136's disclosure index would make the AI-disclosure row and the
-- recording-disclosure row for one call contend for a single per-call slot,
-- so one of the two would be silently dropped.
--
-- Same shape and rationale as 0136: scoped to a non-null call_id because
-- id-less deliveries cannot be deduplicated, and paired with an untargeted
-- onConflictDoNothing in the writer so a redelivery race resolves to exactly
-- one row (and therefore exactly one alert).
--
-- Idempotent and safe to replay. The event names are new as of this migration,
-- so no pre-existing row can collide.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_log_call_ai_disclosure
  ON public.wireline_consent_log (user_id, call_id)
  WHERE call_id IS NOT NULL
    AND event IN (
      'ai_disclosure_played',
      'ai_disclosure_not_detected',
      'ai_disclosure_unverifiable'
    );
