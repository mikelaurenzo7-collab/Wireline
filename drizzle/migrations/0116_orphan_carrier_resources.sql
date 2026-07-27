-- Platform orphan ledger for carrier numbers that failed release during GDPR
-- account purge. Must outlive the tenant hard-delete so ops/janitor can finish
-- teardown with durable e164 + provider ids.
--
-- Idempotent. Apply live as an owner role (Supabase apply_migration or
-- equivalent) — merging this file does not run it against the shared database.

CREATE TABLE IF NOT EXISTS public.wireline_orphan_carrier_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  former_user_id uuid NOT NULL,
  phone_number text NOT NULL,
  vapi_number_id text,
  last_error text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_orphan_carrier_resources_status
  ON public.wireline_orphan_carrier_resources USING btree (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orphan_carrier_resources_phone
  ON public.wireline_orphan_carrier_resources USING btree (phone_number);

ALTER TABLE public.wireline_orphan_carrier_resources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_orphan_carrier_resources TO wireline_server;
    DROP POLICY IF EXISTS server_full_access ON public.wireline_orphan_carrier_resources;
    -- Platform-global cleanup ledger (no tenant user_id on the surviving row
    -- after purge). Trusted server role gets full access; direct API roles stay
    -- default-deny via RLS with no anon/authenticated policies.
    CREATE POLICY server_full_access ON public.wireline_orphan_carrier_resources
      FOR ALL TO wireline_server
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
