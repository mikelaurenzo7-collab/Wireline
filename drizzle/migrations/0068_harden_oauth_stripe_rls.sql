-- 0068: Document fail-closed posture for server-only OAuth bridge + Stripe idempotency store.
--
-- Both tables are written/read only by the Wireline server (postgres owner bypasses RLS).
-- Browser roles already lack table grants; explicit deny policies satisfy the Supabase
-- "RLS enabled but no policy" linter and block GraphQL/PostgREST discovery paths.

ALTER TABLE wireline_oauth_pending_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wireline_oauth_pending_codes FROM anon, authenticated;
DROP POLICY IF EXISTS deny_browser_access ON wireline_oauth_pending_codes;
CREATE POLICY deny_browser_access ON wireline_oauth_pending_codes
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE wireline_stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wireline_stripe_events FROM anon, authenticated;
DROP POLICY IF EXISTS deny_browser_access ON wireline_stripe_events;
CREATE POLICY deny_browser_access ON wireline_stripe_events
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);