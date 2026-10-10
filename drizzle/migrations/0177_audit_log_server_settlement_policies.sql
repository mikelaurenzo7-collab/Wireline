-- Managed AI spend reservations are inserted by wireline_server, then updated
-- with the provider's actual usage/cost or deleted after a definite rejection.
-- Keep those writes tenant-scoped so settlement works without widening access.
DROP POLICY IF EXISTS server_audit_update ON public.wireline_audit_log;
CREATE POLICY server_audit_update ON public.wireline_audit_log
  FOR UPDATE TO wireline_server
  USING (user_id = (SELECT public.wireline_current_user_id()))
  WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));

DROP POLICY IF EXISTS server_audit_delete ON public.wireline_audit_log;
CREATE POLICY server_audit_delete ON public.wireline_audit_log
  FOR DELETE TO wireline_server
  USING (user_id = (SELECT public.wireline_current_user_id()));
