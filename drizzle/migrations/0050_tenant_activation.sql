-- Tenant activation — time from signup to first useful production call.

ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_activation_call_id bigint,
  ADD COLUMN IF NOT EXISTS time_to_activation_seconds integer,
  ADD COLUMN IF NOT EXISTS activation_channel text;

CREATE INDEX IF NOT EXISTS idx_settings_activated_at ON wireline_settings USING btree (activated_at) WHERE activated_at IS NOT NULL;
