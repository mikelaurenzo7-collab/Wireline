-- Prevent duplicate outbound leads when intake retries share an idempotency key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbound_leads_user_idempotency
  ON wireline_outbound_leads (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
