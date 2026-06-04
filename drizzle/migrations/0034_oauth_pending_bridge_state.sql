ALTER TABLE wireline_oauth_pending_codes
  ADD COLUMN IF NOT EXISTS bridge_state text;
