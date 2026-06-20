-- The authenticated application role was denied access to the first tables
-- queried immediately after login. RLS remains enabled; these grants only
-- restore table-level access so RLS policies continue to enforce tenancy.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.wireline_agents,
  public.wireline_settings,
  public.wireline_crm_connections
TO authenticated, anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
