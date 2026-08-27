-- 0161: durable, pool-safe account-operation admission leases.
--
-- A transaction-scoped advisory lock is still the exact admission boundary,
-- but it is held only while this lease is inserted. Provider and Stripe HTTP
-- work then happens without pinning one of the five application connections.
-- Terminal account erasure refuses every unexpired lease; a crashed process is
-- bounded by the lease expiry and provider-specific reconciliation.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wireline_account_operation_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  operation text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_account_operation_leases_kind_check
    CHECK (kind IN ('billing', 'provider'))
);

CREATE INDEX IF NOT EXISTS idx_account_operation_leases_active_user
  ON public.wireline_account_operation_leases (user_id, expires_at);

ALTER TABLE public.wireline_account_operation_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_account_operation_leases FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_account_operation_leases
  FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_account_operation_leases;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_account_operation_leases TO wireline_server;

    CREATE POLICY tenant_isolation
      ON public.wireline_account_operation_leases
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

COMMENT ON TABLE public.wireline_account_operation_leases IS
  'Short-lived provider and billing admission leases that serialize external work with account erasure without pinning a database connection.';

RESET lock_timeout;
