-- 0171 — durable at-most-once fence for account-holder SMS replies.
--
-- The browser supplies a stable operation key for one intentional send. The
-- server records the exact request hash and atomically changes `reserved` to
-- `attempting` immediately before the first Twilio request. A duplicate HTTP
-- request therefore replays the durable outcome instead of sending again.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wireline_sms_send_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.wireline_sms_threads(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  provider_sid text,
  provider_status text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_sms_send_operations_status_check
    CHECK (status IN ('reserved', 'attempting', 'accepted', 'rejected', 'ambiguous'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_send_operations_user_idempotency
  ON public.wireline_sms_send_operations (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_sms_send_operations_thread_created
  ON public.wireline_sms_send_operations (thread_id, created_at);

ALTER TABLE public.wireline_sms_send_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_sms_send_operations FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_sms_send_operations
  FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_sms_send_operations;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_sms_send_operations TO wireline_server;

    CREATE POLICY tenant_isolation
      ON public.wireline_sms_send_operations
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

COMMENT ON TABLE public.wireline_sms_send_operations IS
  'Durable idempotency and provider-attempt fence for authenticated account-holder SMS replies.';

RESET lock_timeout;
