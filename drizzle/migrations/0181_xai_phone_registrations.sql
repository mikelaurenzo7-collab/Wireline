-- 0181 — xAI Grok Voice registrations for BotBound phone numbers.
--
-- Each Twilio number that answers on xAI is registered once with xAI's
-- POST /v2/phone-numbers (origin byo_trunk). xAI returns a per-number webhook
-- signing secret exactly once, and BotBound generates SIP digest credentials
-- that Twilio presents when it bridges the call. Both secrets are stored only
-- as secret-vault envelopes.
--
-- Platform-owned and read only outside tenant context (tenantStore.exit): row
-- level security is on with no policy for any request role, and no request
-- role is granted access.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wireline_xai_phone_registrations (
  phone_number              text PRIMARY KEY,
  xai_phone_number_id       text NOT NULL,
  xai_webhook_id            text NOT NULL,
  webhook_secret_encrypted  text NOT NULL,
  sip_username              text NOT NULL,
  sip_password_encrypted    text NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_xai_phone_registrations_phone_check
    CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT wireline_xai_phone_registrations_ids_check
    CHECK (char_length(xai_phone_number_id) BETWEEN 1 AND 200
       AND char_length(xai_webhook_id) BETWEEN 1 AND 200),
  CONSTRAINT wireline_xai_phone_registrations_sip_username_check
    CHECK (sip_username ~ '^[A-Za-z0-9]{8,64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_registrations_provider_id
  ON public.wireline_xai_phone_registrations USING btree (xai_phone_number_id);
--> statement-breakpoint
ALTER TABLE public.wireline_xai_phone_registrations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.wireline_xai_phone_registrations FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_xai_phone_registrations FROM anon, authenticated, service_role;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY deny_direct_api_access ON public.wireline_xai_phone_registrations FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

RESET lock_timeout;
