-- 0135: Make completed live-voice accounting idempotent per provider call.
--
-- wireline_quota_usage is a monthly aggregate. It cannot prove whether a
-- particular Vapi end-of-call report has already contributed to that aggregate,
-- so retrying a report could either double-count minutes or, if retries were
-- suppressed, permanently lose a charge after a downstream compliance failure.
-- This table records the exact accounting result once per tenant/provider call
-- and lets retries resume an unfinished Runtime Balance debit safely.

CREATE TABLE IF NOT EXISTS public.wireline_voice_usage_events (
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  provider_call_id text NOT NULL,
  period_key text NOT NULL,
  billable_minutes integer NOT NULL CHECK (billable_minutes > 0),
  incremental_overage_minutes integer NOT NULL DEFAULT 0 CHECK (incremental_overage_minutes >= 0),
  overage_cost_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK (overage_cost_usd >= 0),
  counted_at timestamptz NOT NULL DEFAULT now(),
  charged_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_call_id)
);

CREATE INDEX IF NOT EXISTS idx_voice_usage_events_user_period
  ON public.wireline_voice_usage_events (user_id, period_key);

ALTER TABLE public.wireline_voice_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_voice_usage_events;
CREATE POLICY tenant_isolation ON public.wireline_voice_usage_events
  FOR ALL
  USING (user_id = (SELECT public.wireline_current_user_id()))
  WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_voice_usage_events TO wireline_server;

COMMENT ON TABLE public.wireline_voice_usage_events IS
  'Per-provider-call idempotency checkpoint for monthly live-voice usage and Runtime Balance overage charging.';
