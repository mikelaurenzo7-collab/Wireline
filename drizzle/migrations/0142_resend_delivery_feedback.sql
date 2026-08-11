-- Authenticated Resend delivery feedback + provider-level delivery suppression.
--
-- This is deliberately separate from wireline_email_suppressions:
-- that table also carries user unsubscribe preference. A provider hard bounce
-- must stop repeated delivery attempts without turning into an unsubscribe
-- preference or suppressing the user's ability to change marketing settings.

CREATE TABLE IF NOT EXISTS public.wireline_email_delivery_suppressions (
  email         text PRIMARY KEY,
  provider      text NOT NULL DEFAULT 'resend',
  reason        text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_suppressions_updated
  ON public.wireline_email_delivery_suppressions USING btree (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.wireline_resend_webhook_events (
  webhook_id        text PRIMARY KEY,
  event_type        text NOT NULL,
  email_id          text,
  occurred_at       timestamptz NOT NULL,
  recipient_count   integer NOT NULL DEFAULT 0,
  suppression_count integer NOT NULL DEFAULT 0,
  detail_code       text,
  processed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_type_occurred
  ON public.wireline_resend_webhook_events USING btree (event_type, occurred_at DESC);

ALTER TABLE public.wireline_email_delivery_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wireline_resend_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY deny_direct_api_access ON public.wireline_email_delivery_suppressions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_email_delivery_suppressions FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY deny_direct_api_access ON public.wireline_resend_webhook_events FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_resend_webhook_events FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_email_delivery_suppressions TO wireline_server;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_resend_webhook_events TO wireline_server;
