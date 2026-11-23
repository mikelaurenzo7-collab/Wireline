-- Read-only. Run against production (Supabase SQL editor or the Supabase MCP)
-- to refresh tests/db/fixtures/production-security.sql when policies, grants
-- or unique indexes change. Each query returns one text column of statements.

-- 1. Row security, policies, wireline_server grants (table and sequence).
WITH seqs AS MATERIALIZED (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
), seq_grants AS MATERIALIZED (
  SELECT relname FROM seqs WHERE has_sequence_privilege('wireline_server', oid, 'USAGE')
)
SELECT string_agg(stmt, E'\n' ORDER BY ord, k) FROM (
  SELECT 1 AS ord, c.relname AS k,
    format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', c.relname) AS stmt
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  UNION ALL
  SELECT 2, p.tablename || p.policyname, format(
    'DO $$ BEGIN IF to_regclass(%L) IS NOT NULL THEN CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s; END IF; END $$;',
    'public.' || p.tablename, p.policyname, p.tablename, p.permissive, p.cmd,
    array_to_string(p.roles, ', '),
    CASE WHEN p.qual IS NOT NULL THEN ' USING (' || p.qual || ')' ELSE '' END,
    CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK (' || p.with_check || ')' ELSE '' END)
  FROM pg_policies p WHERE p.schemaname = 'public'
  UNION ALL
  SELECT 3, g.table_name, format(
    'DO $$ BEGIN IF to_regclass(%L) IS NOT NULL THEN GRANT %s ON public.%I TO wireline_server; END IF; END $$;',
    'public.' || g.table_name, string_agg(DISTINCT g.privilege_type, ', '), g.table_name)
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'wireline_server' AND g.table_schema = 'public' GROUP BY g.table_name
  UNION ALL
  SELECT 4, relname, format(
    'DO $$ BEGIN IF to_regclass(%L) IS NOT NULL THEN GRANT USAGE, SELECT ON SEQUENCE public.%I TO wireline_server; END IF; END $$;',
    'public.' || relname, relname)
  FROM seq_grants
) x;

-- 2. Unique indexes (compare names with a fresh `drizzle-kit push`; the
--    fixture carries only those the Drizzle schema does not declare).
SELECT i.tablename, i.indexname, i.indexdef
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
JOIN pg_index x ON x.indexrelid = c.oid
WHERE i.schemaname = 'public' AND x.indisunique AND NOT x.indisprimary
ORDER BY i.tablename, i.indexname;
