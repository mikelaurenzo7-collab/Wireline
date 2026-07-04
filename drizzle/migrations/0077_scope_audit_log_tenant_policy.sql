-- 0077: Scope audit-log tenant policy away from the server insert path.
--
-- 0075 gave wireline_server an unconditional INSERT path for system audit
-- events with NULL user_id. The older tenant_isolation policy was still
-- public/all-roles, so Supabase flagged two permissive INSERT policies for
-- wireline_server. Keep tenant-scoped reads/writes for authenticated users;
-- leave server_audit_insert as the only wireline_server INSERT policy.
ALTER POLICY tenant_isolation ON public.wireline_audit_log TO authenticated;
