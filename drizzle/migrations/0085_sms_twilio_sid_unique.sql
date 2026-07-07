-- Idempotent inbound SMS: Twilio retries must not duplicate inbox rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_messages_user_twilio_sid
  ON wireline_sms_messages (user_id, twilio_sid)
  WHERE twilio_sid IS NOT NULL;
