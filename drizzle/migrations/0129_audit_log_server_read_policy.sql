-- 0129 — restore tenant-scoped audit-log reads for the server role.
--
-- The committed policy chain leaves wireline_server with only the INSERT
-- path from 0075 on wireline_audit_log: 0077 altered tenant_isolation TO
-- authenticated, and 0069 revoked authenticated's table grants, so no
-- permissive SELECT policy applies to the server role and audit SELECTs
-- default-deny to zero rows. That silently breaks three call paths:
--   1. spend MTD sums (spend-guards getBudgetSnapshot), so budget thresholds
--      never trip;
--   2. agent-tool / action-execution idempotency dedup, which fails open and
--      can re-execute side effects on retry;
--   3. user-facing audit and insights reads.
-- Reads stay tenant-scoped; system rows with NULL user_id remain invisible to
-- tenant contexts. INSERT/UPDATE/DELETE paths are unchanged.

DROP POLICY IF EXISTS server_audit_read ON public.wireline_audit_log;
CREATE POLICY server_audit_read ON public.wireline_audit_log
  FOR SELECT TO wireline_server
  USING (user_id = (SELECT public.wireline_current_user_id()));
