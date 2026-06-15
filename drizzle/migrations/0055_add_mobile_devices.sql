-- Assistant mobile devices: APNs / PushKit VoIP push targets.
--
-- One row per registered mobile device per user. iOS devices register APNs
-- PushKit VoIP and alert tokens after sign-in so the backend can wake the
-- app with a CallKit-reportable VoIP push when an inbound call arrives.
-- Android devices are represented by platform + fcm_token in migration 0058.
-- FK cascade removes rows when the user is deleted; the (user_id, device_id)
-- unique key makes token refresh an idempotent upsert.
--
-- Idempotent: CREATE ... IF NOT EXISTS so this is safe to re-run.

CREATE TABLE IF NOT EXISTS wireline_mobile_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES wireline_users(id) ON DELETE CASCADE,
  device_id        TEXT NOT NULL,
  apns_voip_token  TEXT,
  apns_alert_token TEXT,
  platform         TEXT NOT NULL DEFAULT 'ios',
  app_version      TEXT,
  last_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS wireline_mobile_devices_user_device_key
  ON wireline_mobile_devices (user_id, device_id);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_user_id
  ON wireline_mobile_devices USING btree (user_id);

ALTER TABLE wireline_mobile_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_mobile_devices;
CREATE POLICY tenant_isolation ON wireline_mobile_devices
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));

DROP TRIGGER IF EXISTS trg_wireline_mobile_devices_set_updated_at ON wireline_mobile_devices;
CREATE TRIGGER trg_wireline_mobile_devices_set_updated_at
  BEFORE UPDATE ON wireline_mobile_devices
  FOR EACH ROW EXECUTE FUNCTION wireline_set_updated_at();