-- Wireline Design export integrations (Figma, Canva, GitHub OAuth tokens).

CREATE TABLE IF NOT EXISTS wireline_design_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  provider          TEXT NOT NULL,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  expires_at        TIMESTAMPTZ,
  connected_account TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wireline_design_integrations_user_id_provider_key
  ON wireline_design_integrations (user_id, provider);

ALTER TABLE wireline_design_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_design_integrations;
CREATE POLICY tenant_isolation ON wireline_design_integrations
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

DROP TRIGGER IF EXISTS trg_wireline_design_integrations_set_updated_at ON wireline_design_integrations;
CREATE TRIGGER trg_wireline_design_integrations_set_updated_at
  BEFORE UPDATE ON wireline_design_integrations
  FOR EACH ROW EXECUTE FUNCTION wireline_set_updated_at();

ALTER TABLE wireline_design_profiles
  ADD COLUMN IF NOT EXISTS token_manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
