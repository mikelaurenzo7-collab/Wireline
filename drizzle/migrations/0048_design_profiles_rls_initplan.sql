-- 0048: InitPlan-safe tenant_isolation on design profiles (Supabase lint 0003).

DROP POLICY IF EXISTS tenant_isolation ON wireline_design_profiles;
CREATE POLICY tenant_isolation ON wireline_design_profiles
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));
