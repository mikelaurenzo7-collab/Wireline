-- 0116 — durable carrier-orphan handoff for account deletion.
--
-- A GDPR purge must not erase the only ownership/provider identifiers for a
-- Twilio/Vapi number that failed carrier release. The platform-global ledger
-- outlives the tenant row so an operator or janitor can finish teardown.
--
-- Idempotent and safe to replay after an urgent Supabase owner-role apply.

CREATE TABLE IF NOT EXISTS public.wireline_orphan_carrier_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  former_user_id uuid NOT NULL,
  phone_number text NOT NULL,
  vapi_number_id text,
  last_error text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_orphan_carrier_resources_status
  ON public.wireline_orphan_carrier_resources USING btree (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orphan_carrier_resources_phone
  ON public.wireline_orphan_carrier_resources USING btree (phone_number);

-- A purge job may retry after the orphan handoff succeeds. Keep one open work
-- item per former tenant + number and refresh its diagnostic details instead of
-- multiplying carrier-cleanup work.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orphan_carrier_resources_open
  ON public.wireline_orphan_carrier_resources (former_user_id, phone_number)
  WHERE status = 'pending';

ALTER TABLE public.wireline_orphan_carrier_resources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_orphan_carrier_resources TO wireline_server;

    DROP POLICY IF EXISTS server_full_access
      ON public.wireline_orphan_carrier_resources;

    -- Platform-global cleanup ledger: direct API roles remain default-denied;
    -- the trusted application role needs access outside tenant context because
    -- the tenant itself is being deleted.
    CREATE POLICY server_full_access
      ON public.wireline_orphan_carrier_resources
      FOR ALL TO wireline_server
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
