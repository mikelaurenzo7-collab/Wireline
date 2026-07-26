-- Finish what 0104 + 0114 started for the four MCP OAuth tables.
--
-- 0104 granted wireline_server table privileges, and 0114 fixed the missing
-- permissive RLS policies for wireline_browser_handoffs /
-- wireline_recap_artifacts — but the MCP tables were left out of 0114. RLS is
-- enabled on all four (0072 for the token tables, ensureMcpSchema() inline for
-- wireline_mcp_oauth_clients) and the only policy targets anon/authenticated,
-- so wireline_server still default-denies: any tenant-context query (GDPR
-- account purge via ACCOUNT_DELETION_TARGETS, future admin/export surfaces)
-- silently reads/deletes zero rows instead of erroring.
--
-- Token tables get standard tenant isolation (they all carry user_id). The
-- client registry is platform-global (no user_id), so the trusted server role
-- gets full row access there — mirroring wireline_recap_artifacts in 0114.
-- deny_direct_api_access still blocks anon/authenticated on all four.
--
-- Idempotent (drop-if-exists + create, to_regclass guards). Must be applied
-- live as an owner role via Supabase apply_migration — merging this file does
-- not run it against the live database.

DO $$
DECLARE
  mcp_table text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    RAISE NOTICE 'wireline_server role missing — skipping MCP policy creation';
    RETURN;
  END IF;

  FOREACH mcp_table IN ARRAY ARRAY[
    'wireline_mcp_oauth_codes',
    'wireline_mcp_access_tokens',
    'wireline_mcp_refresh_tokens'
  ] LOOP
    IF to_regclass('public.' || mcp_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', mcp_table);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO wireline_server '
        || 'USING (user_id = (SELECT public.wireline_current_user_id())) '
        || 'WITH CHECK (user_id = (SELECT public.wireline_current_user_id()))',
        mcp_table
      );
    END IF;
  END LOOP;

  IF to_regclass('public.wireline_mcp_oauth_clients') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS wireline_server_access ON public.wireline_mcp_oauth_clients';
    EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_mcp_oauth_clients '
      || 'FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
  END IF;
END
$$;
