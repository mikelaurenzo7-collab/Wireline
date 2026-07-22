-- Signup RLS note (idempotent documentation migration).
--
-- Brand-new user inserts cannot satisfy
--   WITH CHECK (id = wireline_current_user_id())
-- under ROLE wireline_server, and INSERT ... RETURNING also evaluates USING,
-- so a null-GUC WITH CHECK widening is insufficient and unsafe for SELECT.
--
-- Hardening lives in application code: `AuthService.signUp` runs inside
-- `tenantStore.run("", ...)` so the pool monkey-patch skips SET LOCAL ROLE
-- and the checkout uses the postgres role (`rolbypassrls`), which is the
-- intentional bootstrap path for create-user.
--
-- This migration is a no-op marker so the journal/history records the decision.
-- Re-assert the strict tenant policy in case a prior experiment widened it.

DO $$
BEGIN
  IF to_regclass('public.wireline_users') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS wireline_users_signup_bootstrap_insert ON public.wireline_users';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.wireline_users';
  EXECUTE $policy$
    CREATE POLICY tenant_isolation ON public.wireline_users
      FOR ALL
      USING (id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (id = (SELECT public.wireline_current_user_id()))
  $policy$;
END $$;
