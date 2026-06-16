-- Android FCM push token on mobile devices.
--
-- The iOS app registers a split APNs pair (voip + alert). Android registers a
-- single Firebase Cloud Messaging registration token that carries both the
-- wake shape (high-priority data message → ConnectionService incoming call)
-- and the alert shape (recap / device-action). One nullable column added to
-- the existing wireline_mobile_devices table; the (user_id, device_id) upsert
-- and the platform discriminator already cover Android rows.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so this is safe to re-run.

ALTER TABLE wireline_mobile_devices
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;
