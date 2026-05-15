-- Migration: backfill columns referenced by route handlers that were missing
-- from both the Drizzle schema and the live database. Each ALTER below
-- corresponds to a real route or worker handler whose query silently failed
-- (returned 0 rows or threw and was caught by a route-level try/catch).
--
-- Detected by scripts/audit-schema-drift.mts.

------------------------------------------------------------------------
-- wireline_settings: tenant-default autonomy used by action-engine.ts
------------------------------------------------------------------------
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS autonomy_level TEXT DEFAULT 'draft';

------------------------------------------------------------------------
-- wireline_email_accounts / wireline_calendar_accounts: OAuth scope
-- tracking used by computeIntegrationHealth + /api/oauth/*/callback.
------------------------------------------------------------------------
ALTER TABLE wireline_email_accounts
  ADD COLUMN IF NOT EXISTS oauth_granted_scopes TEXT;

ALTER TABLE wireline_calendar_accounts
  ADD COLUMN IF NOT EXISTS oauth_granted_scopes TEXT;

------------------------------------------------------------------------
-- wireline_calendar_accounts: the OAuth callback upserts with
-- onConflict: "user_id,email_address". The column was missing entirely,
-- so every Google/Microsoft OAuth callback failed at the calendar
-- account upsert step.
------------------------------------------------------------------------
ALTER TABLE wireline_calendar_accounts
  ADD COLUMN IF NOT EXISTS email_address TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wireline_calendar_accounts_user_id_email_address_key'
  ) THEN
    ALTER TABLE wireline_calendar_accounts
      ADD CONSTRAINT wireline_calendar_accounts_user_id_email_address_key
      UNIQUE (user_id, email_address);
  END IF;
END $$;

------------------------------------------------------------------------
-- wireline_lead_dossiers: email used by GET /api/contacts/:number
------------------------------------------------------------------------
ALTER TABLE wireline_lead_dossiers
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

CREATE INDEX IF NOT EXISTS idx_lead_dossiers_user_email
  ON wireline_lead_dossiers USING btree (user_id, customer_email)
  WHERE customer_email IS NOT NULL;

------------------------------------------------------------------------
-- wireline_outbound_leads: callback scheduling + summary used by
-- /api/callbacks and the AI Action Engine.
------------------------------------------------------------------------
ALTER TABLE wireline_outbound_leads
  ADD COLUMN IF NOT EXISTS callback_scheduled_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE wireline_outbound_leads
  ADD COLUMN IF NOT EXISTS last_contact_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_callback_scheduled_at
  ON wireline_outbound_leads USING btree (user_id, callback_scheduled_at)
  WHERE callback_scheduled_at IS NOT NULL;
