-- 0187: usage billing ledger and owner spend controls.
--
-- Shipped dark: no code path reads or writes these tables unless
-- USAGE_BILLING_ENABLED is true. Numbered 0187 so it lands after PR #1360's
-- 0186_live_voice_clones; promote both together.
--
-- wireline_usage_meter_events: one row per billable unit of work. The unique
-- idempotency key makes recording replay-safe and doubles as the Stripe meter
-- event identifier. billable_quantity records what was reported after the
-- owner's spend cap clamp, so an invoice can never exceed the cap.
--
-- wireline_usage_spend_controls: the owner's monthly cap and the highest
-- 50/80/100% alert already sent for the current period.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wireline_usage_meter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL
    CONSTRAINT wireline_usage_meter_events_user_id_wireline_users_id_fk
    REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  meter text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text NOT NULL,
  quantity numeric(14, 4) NOT NULL,
  billable_quantity numeric(14, 4),
  status text DEFAULT 'pending' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  reported_at timestamp with time zone,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT wireline_usage_meter_events_meter_check
    CHECK (meter IN ('call_minutes', 'emails_handled', 'computer_minutes')),
  CONSTRAINT wireline_usage_meter_events_status_check
    CHECK (status IN ('pending', 'reported', 'skipped')),
  CONSTRAINT wireline_usage_meter_events_quantity_check
    CHECK (quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_meter_events_idempotency_key
  ON public.wireline_usage_meter_events USING btree (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_usage_meter_events_user_period
  ON public.wireline_usage_meter_events USING btree (user_id, period_key, meter);

CREATE INDEX IF NOT EXISTS idx_usage_meter_events_pending
  ON public.wireline_usage_meter_events USING btree (created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.wireline_usage_spend_controls (
  user_id uuid PRIMARY KEY NOT NULL
    CONSTRAINT wireline_usage_spend_controls_user_id_wireline_users_id_fk
    REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  monthly_cap_usd numeric(10, 2) DEFAULT 100.00 NOT NULL,
  alert_period_key text,
  alert_level_pct integer DEFAULT 0 NOT NULL,
  number_addons integer DEFAULT 0 NOT NULL,
  email_address_addons integer DEFAULT 0 NOT NULL,
  paused_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT wireline_usage_spend_controls_cap_check
    CHECK (monthly_cap_usd > 0 AND monthly_cap_usd <= 25000),
  CONSTRAINT wireline_usage_spend_controls_alert_check
    CHECK (alert_level_pct IN (0, 50, 80, 100)),
  CONSTRAINT wireline_usage_spend_controls_addons_check
    CHECK (number_addons BETWEEN 0 AND 500 AND email_address_addons BETWEEN 0 AND 500)
);

ALTER TABLE public.wireline_usage_meter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wireline_usage_spend_controls ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_usage_meter_events FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_usage_meter_events FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.wireline_usage_spend_controls FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_usage_spend_controls FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_usage_meter_events;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_usage_spend_controls;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_usage_meter_events TO wireline_server;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_usage_spend_controls TO wireline_server;

    CREATE POLICY tenant_isolation
      ON public.wireline_usage_meter_events
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));

    CREATE POLICY tenant_isolation
      ON public.wireline_usage_spend_controls
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

COMMENT ON TABLE public.wireline_usage_meter_events IS
  'Usage billing ledger: one idempotent row per billable unit of work, reported to Stripe meters with the idempotency key as identifier.';
COMMENT ON TABLE public.wireline_usage_spend_controls IS
  'Owner monthly spend cap and the highest 50/80/100 percent alert sent for the period.';

RESET lock_timeout;
