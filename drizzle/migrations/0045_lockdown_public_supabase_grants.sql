-- 0045: server-only database grant lockdown
--
-- Wireline uses the server's Postgres connection; it does not use supabase-js
-- or the public anon/authenticated database roles. Revoke those roles from all
-- public tables, sequences, and functions so REST/GraphQL discovery cannot
-- become a second unreviewed data-access surface.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Keep future public objects private by default when created by the migration
-- owner. Server-side Postgres access remains unchanged.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
