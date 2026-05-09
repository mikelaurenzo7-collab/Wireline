-- FK constraints and atomic intake-key increment function.

-- wireline_appointments.agent_id already exists in schema.sql with ON DELETE SET NULL,
-- but enforce it idempotently in case earlier migrations did not apply cleanly.
ALTER TABLE wireline_appointments
  DROP CONSTRAINT IF EXISTS wireline_appointments_agent_id_fkey;
ALTER TABLE wireline_appointments
  ADD CONSTRAINT wireline_appointments_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES wireline_agents(id) ON DELETE SET NULL;

-- Spend alerts and webhook deliveries must cascade-delete with the owning user.
ALTER TABLE wireline_spend_alerts
  DROP CONSTRAINT IF EXISTS wireline_spend_alerts_user_id_fkey;
ALTER TABLE wireline_spend_alerts
  ADD CONSTRAINT wireline_spend_alerts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE wireline_webhook_deliveries
  DROP CONSTRAINT IF EXISTS wireline_webhook_deliveries_user_id_fkey;
ALTER TABLE wireline_webhook_deliveries
  ADD CONSTRAINT wireline_webhook_deliveries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Atomic intake-key counter: avoids read-then-write race under concurrent bulk intake.
CREATE OR REPLACE FUNCTION increment_intake_key_use_count(key_id UUID, delta INT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE wireline_intake_keys
  SET use_count = use_count + delta,
      last_used_at = now()
  WHERE id = key_id;
$$;
