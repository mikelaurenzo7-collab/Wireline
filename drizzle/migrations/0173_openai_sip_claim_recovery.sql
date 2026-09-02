-- 0173: make native OpenAI SIP admission authentic, replay-safe, and crash-resumable.
--
-- The signed Twilio source id can own only one OpenAI call. A short durable
-- claim lease lets a retried incoming-call webhook resume after a serverless
-- process disappears before session startup. Spend reservation keys make that
-- recovery adopt the original debit instead of reserving twice.

SET lock_timeout = '5s';

ALTER TABLE public.wireline_audit_log
  ADD COLUMN idempotency_key text;

ALTER TABLE public.wireline_call_logs
  ADD COLUMN openai_sip_source_id text,
  ADD COLUMN openai_sip_phase text,
  ADD COLUMN openai_sip_owner_token uuid,
  ADD COLUMN openai_sip_lease_expires_at timestamptz;

CREATE UNIQUE INDEX uq_audit_cost_reservation_idempotency
  ON public.wireline_audit_log (user_id, action, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX uq_call_logs_openai_sip_source
  ON public.wireline_call_logs (openai_sip_source_id)
  WHERE openai_sip_source_id IS NOT NULL;

COMMENT ON COLUMN public.wireline_call_logs.openai_sip_source_id IS
  'Signed Twilio CallSid or outbound placement identity; unique to prevent cross-call token replay.';
COMMENT ON COLUMN public.wireline_call_logs.openai_sip_phase IS
  'Durable native SIP admission phase: claimed, running, or terminal.';
COMMENT ON COLUMN public.wireline_audit_log.idempotency_key IS
  'Stable key used to adopt an existing pre-provider cost reservation during safe retry.';

RESET lock_timeout;
