-- Tenant design system profile for Wireline Design (blurb, notes, asset manifest).

CREATE TABLE IF NOT EXISTS wireline_design_profiles (
  user_id        UUID PRIMARY KEY,
  company_blurb  TEXT NOT NULL DEFAULT '',
  style_notes    TEXT NOT NULL DEFAULT '',
  asset_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wireline_design_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_design_profiles;
CREATE POLICY tenant_isolation ON wireline_design_profiles
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

DROP TRIGGER IF EXISTS trg_wireline_design_profiles_set_updated_at ON wireline_design_profiles;
CREATE TRIGGER trg_wireline_design_profiles_set_updated_at
  BEFORE UPDATE ON wireline_design_profiles
  FOR EACH ROW EXECUTE FUNCTION wireline_set_updated_at();
