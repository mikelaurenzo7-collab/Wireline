-- 0194 — outbound purpose compliance.
-- Optional per-workspace National DNC account number, per-contact confirmation
-- store, and an append-only allow/block audit. Audit rows are kept for 5 years
-- and are intentionally absent from wireline_purge_old_data. Apply via the
-- Supabase migration process right before merge.
-- LAWYER REVIEW NEEDED: retention wording is a product record, not a legal opinion.

ALTER TABLE public.wireline_settings
  ADD COLUMN IF NOT EXISTS dnc_san text;
ALTER TABLE public.wireline_settings
  ADD COLUMN IF NOT EXISTS sales_dnc_attestation_user_id uuid,
  ADD COLUMN IF NOT EXISTS sales_dnc_attestation_at timestamptz,
  ADD COLUMN IF NOT EXISTS sales_dnc_attestation_version text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.wireline_contact_outbound_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  permission_confirmed_at timestamptz,
  permission_text_version text,
  nonsales_confirmed_at timestamptz,
  nonsales_text_version text,
  last_purpose text,
  customer_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_contact_outbound_consent_user_phone_key UNIQUE (user_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_contact_outbound_consent_user
  ON public.wireline_contact_outbound_consent USING btree (user_id);

ALTER TABLE public.wireline_contact_outbound_consent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wireline_contact_outbound_consent FROM anon, authenticated;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_contact_outbound_consent FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.wireline_contact_outbound_consent
  TO wireline_server;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.wireline_outbound_purpose_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  destination_e164 text NOT NULL,
  requested_purpose text NOT NULL,
  effective_purpose text NOT NULL,
  derived_relationship jsonb,
  attested boolean NOT NULL DEFAULT false,
  attestation_text_version text,
  sales_attestation_user_id uuid,
  sales_attestation_at timestamptz,
  sales_attestation_version text,
  confirmations jsonb,
  customer_since timestamptz,
  dnc_checked boolean NOT NULL DEFAULT false,
  dnc_source text NOT NULL DEFAULT 'none',
  dnc_result text,
  dnc_list_version text,
  quiet_hours_tz text,
  decision text NOT NULL,
  block_code text,
  actor_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_outbound_purpose_audit_channel_check CHECK (channel IN ('call', 'sms')),
  CONSTRAINT wireline_outbound_purpose_audit_dnc_source_check CHECK (dnc_source IN ('vendor', 'ftc_file', 'none')),
  CONSTRAINT wireline_outbound_purpose_audit_decision_check CHECK (decision IN ('allowed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS idx_outbound_purpose_audit_user_created
  ON public.wireline_outbound_purpose_audit USING btree (user_id, created_at);

ALTER TABLE public.wireline_outbound_purpose_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wireline_outbound_purpose_audit FROM anon, authenticated;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_outbound_purpose_audit FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT ON public.wireline_outbound_purpose_audit TO wireline_server;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.wireline_guard_outbound_purpose_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Outbound purpose audit rows are immutable'
      USING ERRCODE = '23514';
  END IF;
  -- Tenant access is append-only. Only terminal account purge, outside tenant
  -- context and not as wireline_server, may erase rows with the account.
  IF current_user = 'wireline_server'
    OR NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Outbound purpose audit rows can only be erased by terminal account deletion'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END
$$;

REVOKE ALL ON FUNCTION public.wireline_guard_outbound_purpose_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wireline_guard_outbound_purpose_audit() FROM anon, authenticated, service_role;
DROP TRIGGER IF EXISTS wireline_outbound_purpose_audit_guard ON public.wireline_outbound_purpose_audit;
CREATE TRIGGER wireline_outbound_purpose_audit_guard
  BEFORE UPDATE OR DELETE ON public.wireline_outbound_purpose_audit
  FOR EACH ROW EXECUTE FUNCTION public.wireline_guard_outbound_purpose_audit();

COMMENT ON TABLE public.wireline_outbound_purpose_audit IS
  'Append-only outbound allow/block ledger: purpose requested vs applied, relationship, confirmations, DNC result, and timezone. Retained 5 years. Not included in the 365-day purge. No registry credentials.';
COMMENT ON COLUMN public.wireline_settings.dnc_san IS
  'Optional National Do Not Call Registry account number passed as projId on sales lookups. Blank is allowed.';
COMMENT ON COLUMN public.wireline_settings.sales_dnc_attestation_user_id IS
  'User who confirmed one-off sales responsibility. Blank until that one-time checkbox is saved.';
COMMENT ON COLUMN public.wireline_settings.sales_dnc_attestation_at IS
  'When the workspace confirmed one-off sales responsibility.';
COMMENT ON COLUMN public.wireline_settings.sales_dnc_attestation_version IS
  'Wording version of the one-off sales attestation. A newer version asks again.';
COMMENT ON COLUMN public.wireline_outbound_purpose_audit.sales_attestation_user_id IS
  'Who confirmed sales responsibility, copied onto each one-off sales decision.';
COMMENT ON COLUMN public.wireline_outbound_purpose_audit.sales_attestation_at IS
  'When that sales responsibility confirmation was given.';
COMMENT ON COLUMN public.wireline_outbound_purpose_audit.sales_attestation_version IS
  'Wording version copied onto each one-off sales decision.';
