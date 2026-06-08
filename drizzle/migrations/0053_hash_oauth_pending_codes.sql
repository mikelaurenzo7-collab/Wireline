-- Hash OAuth bridge codes and bridge-state cookies before database storage.
-- Pending codes are short-lived; legacy plaintext rows are intentionally dropped
-- because they cannot be safely backfilled without the original plaintext code/state.
DELETE FROM wireline_oauth_pending_codes;

ALTER TABLE wireline_oauth_pending_codes
  DROP CONSTRAINT IF EXISTS wireline_oauth_pending_codes_pkey;

ALTER TABLE wireline_oauth_pending_codes
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS bridge_state_hash text;

ALTER TABLE wireline_oauth_pending_codes
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS token,
  DROP COLUMN IF EXISTS bridge_state;

ALTER TABLE wireline_oauth_pending_codes
  ALTER COLUMN code_hash SET NOT NULL,
  ALTER COLUMN bridge_state_hash SET NOT NULL;

ALTER TABLE wireline_oauth_pending_codes
  ADD CONSTRAINT wireline_oauth_pending_codes_pkey PRIMARY KEY (code_hash);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_codes_expires_at
  ON wireline_oauth_pending_codes (expires_at);
