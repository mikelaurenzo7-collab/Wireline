-- Conversation Balance durability hardening.
--
-- The original wallet ledger was append-only and idempotent via
-- (user_id, ref_type, ref_id), but it did not explicitly capture entry kind,
-- customer-facing reason text, source/provider metadata, or a provider-neutral
-- idempotency key. These columns make top-ups, refunds, manual grants, and
-- future burn events auditable without changing existing balances.

ALTER TABLE wireline_credit_ledger
  ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'adjustment',
  ADD COLUMN IF NOT EXISTS customer_reason TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'wireline',
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_object_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN wireline_credit_ledger.entry_kind IS
  'Conversation Balance movement kind: top_up, burn, refund, adjustment, grant, or reversal.';
COMMENT ON COLUMN wireline_credit_ledger.customer_reason IS
  'Short customer-visible explanation for the balance movement.';
COMMENT ON COLUMN wireline_credit_ledger.idempotency_key IS
  'Provider-neutral idempotency key for exactly-once balance movements.';
COMMENT ON COLUMN wireline_credit_ledger.source IS
  'Originating system or workflow, for example stripe, vapi, manual, migration.';
COMMENT ON COLUMN wireline_credit_ledger.provider IS
  'External provider namespace when applicable.';
COMMENT ON COLUMN wireline_credit_ledger.provider_event_id IS
  'External event id when the movement was caused by a webhook or provider event.';
COMMENT ON COLUMN wireline_credit_ledger.provider_object_id IS
  'External object id such as checkout session, charge, call, or refund id.';
COMMENT ON COLUMN wireline_credit_ledger.metadata IS
  'Small sanitized JSON metadata object for audit and support. Do not store secrets or raw transcripts.';

CREATE UNIQUE INDEX IF NOT EXISTS wireline_credit_ledger_idempotency_key
  ON wireline_credit_ledger (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_ledger_provider
  ON wireline_credit_ledger (provider, provider_event_id, provider_object_id)
  WHERE provider IS NOT NULL;

