-- 0036: RLS initplan perf — evaluate current_setting() once per query, not per
-- row (prod applied via MCP 2026-06-04). Resolves Supabase advisor lint 0003
-- (auth_rls_initplan) on the five tenant_isolation policies that read the
-- `app.current_user_id` GUC.
--
-- Wrapping the GUC read in a scalar subselect turns it into an InitPlan that
-- Postgres caches for the whole scan instead of re-evaluating per row. The GUC
-- is constant within a query, so semantics are identical. Policy names + cmd
-- are unchanged.

-- Four tables share the identical `user_id == GUC` policy.
DROP POLICY IF EXISTS "tenant_isolation" ON wireline_director_artifact_objects;
CREATE POLICY "tenant_isolation" ON wireline_director_artifact_objects
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

DROP POLICY IF EXISTS "tenant_isolation" ON wireline_director_artifacts;
CREATE POLICY "tenant_isolation" ON wireline_director_artifacts
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

DROP POLICY IF EXISTS "tenant_isolation" ON wireline_director_profile;
CREATE POLICY "tenant_isolation" ON wireline_director_profile
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

DROP POLICY IF EXISTS "tenant_isolation" ON wireline_agent_team_members;
CREATE POLICY "tenant_isolation" ON wireline_agent_team_members
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

-- Organizations: owner_id OR membership. Wrap each GUC read in its own subselect.
DROP POLICY IF EXISTS "tenant_isolation" ON wireline_organizations;
CREATE POLICY "tenant_isolation" ON wireline_organizations
  FOR ALL
  USING (
    owner_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    OR EXISTS (
      SELECT 1 FROM wireline_memberships m
      WHERE m.organization_id = wireline_organizations.id
        AND m.user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    )
  )
  WITH CHECK (owner_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));
