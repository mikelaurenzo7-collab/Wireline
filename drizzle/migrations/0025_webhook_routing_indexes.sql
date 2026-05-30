-- Hot-path indexes for Vapi webhook agent resolution and caller history.
-- Every inbound call: lookup by vapi_number_id, then recent call_logs by agent + customer.

CREATE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id
  ON wireline_phone_numbers (vapi_number_id)
  WHERE vapi_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_settings_vapi_phone_number_id
  ON wireline_settings (vapi_phone_number_id)
  WHERE vapi_phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_agent_customer_created
  ON wireline_call_logs (agent_id, customer_number, created_at DESC);
