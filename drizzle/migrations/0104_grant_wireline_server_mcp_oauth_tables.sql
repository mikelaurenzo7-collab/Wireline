-- Same footgun as 0103 for four MCP OAuth tables:
--   0070_chatgpt_mcp_oauth.sql created wireline_mcp_oauth_codes,
--   wireline_mcp_access_tokens, wireline_mcp_refresh_tokens with REVOKEs
--   from anon/authenticated and 0072 enabled RLS with a deny_direct_api_access
--   policy — but neither migration granted wireline_server, the role every
--   tenant-scoped app query runs as (SET LOCAL ROLE wireline_server, see
--   src/lib/server-context.ts).
--
--   wireline_mcp_oauth_clients is created out-of-band inside
--   src/routes/chatgpt-mcp-routes.ts:ensureMcpSchema() (CREATE TABLE IF NOT
--   EXISTS) with RLS + deny_direct_api_access enabled inline, and likewise
--   never granted to wireline_server.
--
-- Today the MCP callers in src/routes/chatgpt-mcp-routes.ts and
-- src/routes/chatgpt-mcp-account-routes.ts run outside tenantStore.run(...),
-- so pool.connect's tenant-scope override falls through to the raw login
-- role and RLS is bypassed — the missing grant is latent. As soon as any
-- new tenant-scoped route (account-deletion, account-export, admin panel)
-- queries any of these tables, it hits "permission denied for table
-- wireline_mcp_*".
--
-- Purely additive; safe to re-run. Guard each grant with to_regclass so a
-- fresh environment where ensureMcpSchema() has not created
-- wireline_mcp_oauth_clients yet does not fail the migration.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wireline_mcp_oauth_codes TO wireline_server;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wireline_mcp_access_tokens TO wireline_server;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wireline_mcp_refresh_tokens TO wireline_server;

DO $$
BEGIN
  IF to_regclass('public.wireline_mcp_oauth_clients') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wireline_mcp_oauth_clients TO wireline_server';
  END IF;
END
$$;
