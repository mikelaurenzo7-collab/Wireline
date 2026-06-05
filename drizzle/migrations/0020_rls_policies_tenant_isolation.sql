-- Superseded: this migration targeted legacy table names (wireline_workspaces,
-- wireline_calls, etc.) that are not part of the current Wireline schema.
-- Tenant RLS is defined in 0023_fix_rls_policies_uuid.sql and
-- 0024_rls_policies_empty_guc_safe.sql. No-op so fresh db:migrate runs succeed.
SELECT 1;
