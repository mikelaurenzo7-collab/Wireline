-- 0072: Make MCP OAuth table isolation explicit and normalize tenant RLS GUC access.
--
-- The MCP OAuth tables are backend-only. The explicit deny policy keeps anon and
-- authenticated Data API roles out while removing the "RLS enabled no policy"
-- advisory noise.

DO $$
DECLARE
  mcp_table text;
BEGIN
  FOREACH mcp_table IN ARRAY ARRAY[
    'wireline_mcp_oauth_codes',
    'wireline_mcp_access_tokens',
    'wireline_mcp_refresh_tokens'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', mcp_table);
    EXECUTE format('DROP POLICY IF EXISTS deny_direct_api_access ON public.%I', mcp_table);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format(
        'CREATE POLICY deny_direct_api_access ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        mcp_table
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.wireline_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$function$;

DO $$
DECLARE
  rec record;
  role_clause text;
  using_expr text;
  check_expr text;
BEGIN
  FOR rec IN
    SELECT c.relname AS table_name, p.polroles
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname = 'tenant_isolation'
      AND (
        c.relname IN ('wireline_users', 'wireline_organizations')
        OR EXISTS (
          SELECT 1
          FROM information_schema.columns columns
          WHERE columns.table_schema = 'public'
            AND columns.table_name = c.relname
            AND columns.column_name = 'user_id'
        )
      )
    ORDER BY c.relname
  LOOP
    SELECT string_agg(
      CASE
        WHEN role_oid = 0 THEN 'public'
        ELSE quote_ident(pg_get_userbyid(role_oid))
      END,
      ', '
    )
    INTO role_clause
    FROM unnest(rec.polroles) AS role_oid;

    role_clause := COALESCE(NULLIF(role_clause, ''), 'public');

    IF rec.table_name = 'wireline_users' THEN
      using_expr := 'id = (SELECT public.wireline_current_user_id())';
      check_expr := using_expr;
    ELSIF rec.table_name = 'wireline_organizations' THEN
      using_expr := 'owner_id = (SELECT public.wireline_current_user_id()) OR EXISTS (SELECT 1 FROM public.wireline_memberships m WHERE m.organization_id = wireline_organizations.id AND m.user_id = (SELECT public.wireline_current_user_id()))';
      check_expr := 'owner_id = (SELECT public.wireline_current_user_id())';
    ELSE
      using_expr := 'user_id = (SELECT public.wireline_current_user_id())';
      check_expr := using_expr;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', rec.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO %s USING (%s) WITH CHECK (%s)',
      rec.table_name,
      role_clause,
      using_expr,
      check_expr
    );
  END LOOP;
END $$;
