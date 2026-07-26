-- Restore wireline_server RLS access on two tenant-scoped tables whose
-- permissive allow-policy was never created. RLS is enabled on both and
-- wireline_server (rolbypassrls = false) is an implicit PUBLIC member, so the
-- deny_direct_api_access ... USING(false) policy — plus the default-deny when
-- no policy applies to a role — blocked the app's OWN queries, which run as
-- wireline_server via SET LOCAL ROLE. Both features (shareable call recaps and
-- browser handoffs) were dead on arrival: every INSERT/SELECT raised
-- "new row violates row-level security" / returned zero rows.
--
-- Idempotent (drop-if-exists + create). Must be applied live as an owner role
-- (wireline_server cannot CREATE POLICY) via Supabase apply_migration — merging
-- this file does not run it against the live database.

-- wireline_browser_handoffs: standard tenant isolation. Every route
-- (src/routes/browser-handoff-routes.ts) scopes by user_id = req.user.id and
-- runs in tenant context (authenticateUser sets app.current_user_id), so the
-- server role sees exactly the caller's own rows.
DROP POLICY IF EXISTS tenant_isolation ON public.wireline_browser_handoffs;
CREATE POLICY tenant_isolation ON public.wireline_browser_handoffs
  FOR ALL TO wireline_server
  USING (user_id = (SELECT public.wireline_current_user_id()))
  WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));

-- wireline_recap_artifacts is server-owned. The INSERT runs in tenant context,
-- but the public share route (GET /recap/:slug, unauthenticated) resolves rows
-- by slug + bearer token as wireline_server with NO tenant GUC, so a
-- user_id = current_user_id() policy would leave the public read broken. Access
-- control is enforced at the app layer (slug+token for public reads, user_id
-- filter for the authenticated list/delete/cascade), so the trusted server role
-- gets full row access here. deny_direct_api_access still blocks anon /
-- authenticated (the direct-API Postgres roles).
DROP POLICY IF EXISTS wireline_server_access ON public.wireline_recap_artifacts;
CREATE POLICY wireline_server_access ON public.wireline_recap_artifacts
  FOR ALL TO wireline_server
  USING (true)
  WITH CHECK (true);
