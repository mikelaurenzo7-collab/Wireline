-- 0136 — database backstop for per-call TCPA evidence idempotency.
--
-- handleEndOfCallReport runs on every Vapi end-of-call delivery, and Vapi
-- redelivers on failure. persistComplianceEvidence checks for an existing
-- disclosure/opt-out row before writing, but two workers can claim two
-- redelivery jobs for the same call concurrently and both pass the check
-- before either inserts, producing duplicate append-only ledger rows and a
-- doubled "recording disclosure unverified" alert. These partial unique
-- indexes make the one-row-per-call invariant survive that race and any future
-- refactor, exactly as 0117 did for the Twilio consent MessageSid path.
--
-- Scoped to a non-null call_id: id-less deliveries cannot be deduplicated and
-- are only written on the fresh delivery. One index per event family so a
-- disclosure row and an opt-out row for the same call do not collide.
--
-- Idempotent and safe to replay. Existing production data was written one row
-- per fresh delivery by the pre-0136 handler. Verified against the live
-- database 2026-08-07: zero duplicate (user_id, call_id) pairs for either event
-- family across the consent log, so both unique indexes create cleanly.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_log_call_disclosure
  ON public.wireline_consent_log (user_id, call_id)
  WHERE call_id IS NOT NULL
    AND event IN ('disclosure_played', 'disclosure_not_detected', 'disclosure_unverifiable');

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_log_call_opt_out
  ON public.wireline_consent_log (user_id, call_id)
  WHERE call_id IS NOT NULL
    AND event = 'opt_out_requested';
