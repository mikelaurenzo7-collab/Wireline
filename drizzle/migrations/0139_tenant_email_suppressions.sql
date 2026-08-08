-- 0139 — sender-scoped suppression for tenant campaign email.
--
-- Wireline product/billing marketing keeps using the global
-- wireline_email_suppressions list. Tenant cadences send from each tenant's
-- own business/mailbox, so an opt-out must bind to that sender without
-- suppressing an unrelated tenant that happens to contact the same address.

CREATE TABLE IF NOT EXISTS public.wireline_tenant_email_suppressions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_tenant_email_suppressions_user_email_key UNIQUE (user_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tenant_email_suppressions_user
  ON public.wireline_tenant_email_suppressions USING btree (user_id);

ALTER TABLE public.wireline_tenant_email_suppressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wireline_tenant_email_suppressions FROM anon, authenticated;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_tenant_email_suppressions FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.wireline_tenant_email_suppressions
  TO wireline_server;
