-- 0152: Native Twilio + xAI Direct SIP phone bindings.
--
-- Vapi-specific columns remain untouched during the certification window so
-- rollback and historical call evidence are preserved. Native xAI registration
-- ids and the one-time Standard Webhooks signing secret are stored separately.
-- The signing secret is encrypted by the application before insert.
--
-- External ids are nullable while status='provisioning'. Wireline first claims
-- the tenant number in this table, then persists each non-idempotent provider
-- result as it arrives. This prevents a partial Twilio/xAI/DB failure from
-- losing the one-time webhook signing secret or registering the same number
-- twice without a durable recovery marker. A short-lived UUID claim token
-- prevents concurrent provisioning attempts for the same line.

CREATE TABLE IF NOT EXISTS public.wireline_xai_phone_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES public.wireline_agents(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  twilio_phone_number_sid text,
  twilio_sip_trunk_sid text,
  xai_phone_number_id text,
  xai_webhook_id text,
  webhook_secret_encrypted text,
  webhook_secret_last_four text,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'error', 'retired')),
  provisioning_token uuid,
  provisioning_claimed_at timestamptz,
  last_error text,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xai_phone_bindings_user
  ON public.wireline_xai_phone_bindings (user_id);

CREATE INDEX IF NOT EXISTS idx_xai_phone_bindings_agent
  ON public.wireline_xai_phone_bindings (agent_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_bindings_phone
  ON public.wireline_xai_phone_bindings (phone_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_bindings_twilio_phone
  ON public.wireline_xai_phone_bindings (twilio_phone_number_sid)
  WHERE twilio_phone_number_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_bindings_xai_phone
  ON public.wireline_xai_phone_bindings (xai_phone_number_id)
  WHERE xai_phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_bindings_xai_webhook
  ON public.wireline_xai_phone_bindings (xai_webhook_id)
  WHERE xai_webhook_id IS NOT NULL;

ALTER TABLE public.wireline_xai_phone_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_xai_phone_bindings;
CREATE POLICY tenant_isolation ON public.wireline_xai_phone_bindings
  FOR ALL
  USING (user_id = (SELECT public.wireline_current_user_id()))
  WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.wireline_xai_phone_bindings
  TO wireline_server;

COMMENT ON TABLE public.wireline_xai_phone_bindings IS
  'Tenant-owned Twilio numbers registered to xAI Direct SIP with encrypted per-number webhook verification secrets.';
