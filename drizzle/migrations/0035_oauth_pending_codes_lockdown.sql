-- 0035: Close OAuth pending-codes exposure (prod applied via MCP 2026-06-04)
--
-- wireline_oauth_pending_codes.token holds a pre-minted Wireline JWT. RLS was
-- intentionally left off (see 0026) because the OAuth callback that reads/writes
-- the row runs UNAUTHENTICATED — as the postgres base role, which owns the table
-- and bypasses RLS. But the table still had SELECT granted to `authenticated`,
-- so ANY signed-in user could read every pending JWT directly via the Supabase
-- Data API (PostgREST/GraphQL) and impersonate a user mid-OAuth. That vector
-- never touches the nonce-protected /api/auth/oauth/exchange endpoint, so the
-- "the code is a 256-bit nonce" reasoning in 0026 did not actually protect it.
--
-- Fix: enable RLS (owner=postgres bypasses it, so the unauthenticated callback
-- is unaffected; authenticated/anon resolve to zero rows) AND revoke the direct
-- grants so the table is no longer exposed in the Data API at all. The app only
-- ever touches this table via the base role, never as `authenticated`.

ALTER TABLE wireline_oauth_pending_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wireline_oauth_pending_codes FROM anon, authenticated;
