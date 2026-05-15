-- Migration: add `connected_email` to wireline_crm_connections.
--
-- Every Salesforce/HubSpot/Slack/Zoom OAuth callback writes this column
-- via the Supabase upsert (see src/routes/oauth-routes.ts), and the
-- `/api/oauth/crm/status` endpoint reads it back to render connected
-- account labels in CrmConnectionCard. The column was missing from the
-- live schema so:
--   * every CRM connect attempt failed at the upsert step (Supabase
--     returned "column connected_email does not exist"),
--   * GET /api/oauth/crm/status returned 500 on every call.
--
-- Detected by scripts/audit-schema-drift.mts after expanding the
-- reachability registry to cover the OAuth identity field.

ALTER TABLE wireline_crm_connections
  ADD COLUMN IF NOT EXISTS connected_email TEXT;

-- The OAuth callbacks (Salesforce/HubSpot/Slack/Zoom) upsert with
-- onConflict target `(user_id, provider)` so that reconnecting refreshes
-- the same row instead of stacking duplicates. The constraint was never
-- created so every upsert that survived the column issue would crash on
-- the missing conflict target. Add the unique constraint here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_crm_connections_user_id_provider_key'
  ) THEN
    -- Collapse any pre-existing duplicates (none expected, but make the
    -- ALTER ADD CONSTRAINT idempotent against stuck environments).
    DELETE FROM wireline_crm_connections a
      USING wireline_crm_connections b
      WHERE a.ctid < b.ctid
        AND a.user_id = b.user_id
        AND a.provider = b.provider;

    ALTER TABLE wireline_crm_connections
      ADD CONSTRAINT wireline_crm_connections_user_id_provider_key
      UNIQUE (user_id, provider);
  END IF;
END $$;
