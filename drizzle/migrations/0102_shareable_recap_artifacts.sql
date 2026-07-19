-- Shareable branded recap artifacts.
--
-- A `wireline_recap_artifacts` row is a signed, revocable Wireline page
-- delivered by URL alongside the post-call and weekly-review emails that
-- the plan catalog promises for Starter Plus and up. One `kind` column
-- discriminates between call recap, weekly recap, and (future) proposal
-- surfaces so the publish/verify/render pipeline stays shared.
--
-- Access is gated by an opaque URL slug (public path segment) plus an
-- opaque token (query parameter). The server stores only the SHA-256 of
-- `slug|token`; the raw token is returned to the caller once and never
-- persisted. Timing-safe compare on resolve; unknown-slug, expired, and
-- revoked cases all return an identical 404.
--
-- Workspace branding lives alongside on the tenant settings row so
-- recaps can carry the workspace name in the eyebrow while the
-- Letterpress craft stays owned by Wireline.

CREATE TABLE IF NOT EXISTS wireline_recap_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id TEXT,
  kind TEXT NOT NULL,
  source_ref TEXT,
  slug TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  content JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT wireline_recap_artifacts_kind_check
    CHECK (kind IN ('call_recap', 'weekly_recap', 'proposal')),
  CONSTRAINT wireline_recap_artifacts_slug_shape_check
    CHECK (slug ~ '^[A-Za-z0-9_-]{12,32}$')
);

DO $$
BEGIN
  ALTER TABLE wireline_recap_artifacts
    ADD CONSTRAINT wireline_recap_artifacts_agent_fkey
    FOREIGN KEY (agent_id) REFERENCES wireline_agents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recap_artifacts_slug
  ON wireline_recap_artifacts USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_recap_artifacts_user_published
  ON wireline_recap_artifacts USING btree (user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_recap_artifacts_kind_published
  ON wireline_recap_artifacts USING btree (kind, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_recap_artifacts_source_ref
  ON wireline_recap_artifacts USING btree (source_ref)
  WHERE source_ref IS NOT NULL;

-- Server-owned. Tenant sessions never see raw rows; the public route
-- resolves by slug+token via the trusted server role and returns rendered
-- HTML, never the underlying row.
ALTER TABLE wireline_recap_artifacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY deny_direct_api_access ON wireline_recap_artifacts
    AS PERMISSIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration 0069 granted wireline_server on every table that existed at
-- that time; it did not establish a default for tables created afterward
-- (no ALTER DEFAULT PRIVILEGES was set), so every new tenant-scoped table
-- must grant it explicitly or the app's own tenant-scoped queries (which
-- run as wireline_server via SET LOCAL ROLE) fail with permission denied.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE wireline_recap_artifacts TO wireline_server;

-- Workspace branding columns on wireline_settings.
-- Recaps use the display name in the eyebrow only; the Letterpress
-- structure never yields. Proposals (a future kind) may use the logo +
-- credit toggle; this migration adds them so both features share one
-- brand surface.
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS workspace_display_name TEXT,
  ADD COLUMN IF NOT EXISTS workspace_accent_hex TEXT,
  ADD COLUMN IF NOT EXISTS workspace_theme TEXT NOT NULL DEFAULT 'obsidian',
  ADD COLUMN IF NOT EXISTS workspace_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS workspace_contact_line TEXT,
  ADD COLUMN IF NOT EXISTS workspace_wireline_credit_visible BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  ALTER TABLE wireline_settings
    ADD CONSTRAINT wireline_settings_workspace_theme_check
    CHECK (workspace_theme IN ('obsidian', 'cool_light'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE wireline_settings
    ADD CONSTRAINT wireline_settings_workspace_accent_hex_check
    CHECK (workspace_accent_hex IS NULL OR workspace_accent_hex ~ '^#[0-9A-Fa-f]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
