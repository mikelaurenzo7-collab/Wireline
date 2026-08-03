-- 0120 — session revocation, team invitation completion, and atomic external operations.
--
-- All additions are backward-compatible with the currently deployed server.
-- New application code can be rolled out after this migration without a lockstep
-- deploy. External provider calls are represented by durable operation rows so
-- retries and concurrent requests cannot create duplicate calls or checkouts.

ALTER TABLE public.wireline_users
  ADD COLUMN IF NOT EXISTS session_revoked_before timestamptz NOT NULL DEFAULT to_timestamp(0);

CREATE OR REPLACE FUNCTION public.wireline_revoke_sessions_on_password_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
    NEW.session_revoked_before := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_users_password_session_revocation
  ON public.wireline_users;
CREATE TRIGGER wireline_users_password_session_revocation
BEFORE UPDATE OF password_hash ON public.wireline_users
FOR EACH ROW
EXECUTE FUNCTION public.wireline_revoke_sessions_on_password_change();

REVOKE ALL ON FUNCTION public.wireline_revoke_sessions_on_password_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.wireline_revoke_sessions_on_password_change()
  FROM anon, authenticated;

ALTER TABLE public.wireline_team_members
  ADD COLUMN IF NOT EXISTS invitation_token_hash text,
  ADD COLUMN IF NOT EXISTS invitation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_invitation_token_hash
  ON public.wireline_team_members (invitation_token_hash)
  WHERE invitation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_active_membership
  ON public.wireline_team_members (tenant_id, user_id)
  WHERE user_id IS NOT NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_pending_email
  ON public.wireline_team_members (tenant_id, lower(email))
  WHERE user_id IS NULL AND revoked_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wireline_team_members_user_id_fkey'
  ) THEN
    ALTER TABLE public.wireline_team_members
      ADD CONSTRAINT wireline_team_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wireline_team_members_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.wireline_team_members
      ADD CONSTRAINT wireline_team_members_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.wireline_users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wireline_team_members_invited_by_fkey'
  ) THEN
    ALTER TABLE public.wireline_team_members
      ADD CONSTRAINT wireline_team_members_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES public.wireline_users(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.wireline_outbound_dial_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  operation_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'reserved',
  call_id text,
  failure_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_outbound_dial_reservations_phone_check
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT wireline_outbound_dial_reservations_status_check
    CHECK (status IN ('reserved', 'dialing', 'completed', 'failed', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_dial_active_number
  ON public.wireline_outbound_dial_reservations (user_id, phone_e164)
  WHERE status IN ('reserved', 'dialing');

CREATE INDEX IF NOT EXISTS idx_outbound_dial_reservations_expiry
  ON public.wireline_outbound_dial_reservations (expires_at)
  WHERE status IN ('reserved', 'dialing');

CREATE TABLE IF NOT EXISTS public.wireline_checkout_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  billing_interval text NOT NULL,
  status text NOT NULL DEFAULT 'creating',
  stripe_customer_id text,
  stripe_checkout_session_id text,
  checkout_url text,
  failure_code text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wireline_checkout_operations_interval_check
    CHECK (billing_interval IN ('month', 'year')),
  CONSTRAINT wireline_checkout_operations_status_check
    CHECK (status IN ('creating', 'open', 'completed', 'failed', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_operations_active_user
  ON public.wireline_checkout_operations (user_id)
  WHERE status IN ('creating', 'open');

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkout_operations_stripe_session
  ON public.wireline_checkout_operations (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_operations_expiry
  ON public.wireline_checkout_operations (expires_at)
  WHERE status IN ('creating', 'open');

ALTER TABLE public.wireline_outbound_dial_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wireline_checkout_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_outbound_dial_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_checkout_operations FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_outbound_dial_reservations
  FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.wireline_checkout_operations
  FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_outbound_dial_reservations;
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_checkout_operations;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_outbound_dial_reservations TO wireline_server;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_checkout_operations TO wireline_server;

    CREATE POLICY tenant_isolation
      ON public.wireline_outbound_dial_reservations
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));

    CREATE POLICY tenant_isolation
      ON public.wireline_checkout_operations
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

COMMENT ON COLUMN public.wireline_users.session_revoked_before IS
  'Any Wireline session JWT issued at or before this instant is invalid.';
COMMENT ON TABLE public.wireline_outbound_dial_reservations IS
  'Durable per-number reservations that close the gate-to-provider race for outbound calls.';
COMMENT ON TABLE public.wireline_checkout_operations IS
  'Idempotent Stripe Checkout operation records; one active checkout per tenant.';
