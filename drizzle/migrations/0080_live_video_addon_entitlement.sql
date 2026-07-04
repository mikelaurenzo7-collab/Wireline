-- Workspace-level live video add-on flag (enterprise pilots / future Stripe sync).
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS live_video_addon_enabled boolean NOT NULL DEFAULT false;
