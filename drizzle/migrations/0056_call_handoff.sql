-- "Take this call" handoff support.
--
-- - signal_presence.control_url: the Vapi live-call control URL
--   (monitor.controlUrl) captured from the webhook, so the operator can
--   transfer an in-progress call from the mobile app via Vapi (no raw Twilio).
-- - settings.handoff_phone: the operator's personal callback number (E.164).
--   iOS can't read the device's own number, so the user sets it once and the
--   agent warm-transfers the caller there on "take call".
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so this is safe to re-run.

ALTER TABLE wireline_signal_presence
  ADD COLUMN IF NOT EXISTS control_url TEXT;

ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS handoff_phone TEXT;
