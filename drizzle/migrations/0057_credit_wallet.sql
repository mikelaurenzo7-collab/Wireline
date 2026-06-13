-- Wingman prepaid credit wallet (append-only USD ledger).
--
-- Positive deltas = top-ups (purchased on the WEB via Stripe; never in-app, to
-- stay clear of Apple IAP). Negative deltas = debits that absorb voice-minute
-- overage before Stripe metering. Balance = SUM(delta_usd); balance_after_usd
-- is denormalized per row for audit + fast reads. The (user, ref_type, ref_id)
-- unique key makes credits/debits idempotent.
--
-- Idempotent: CREATE ... IF NOT EXISTS so this is safe to re-run.

CREATE TABLE IF NOT EXISTS wireline_credit_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES wireline_users(id) ON DELETE CASCADE,
  delta_usd         NUMERIC(12, 4) NOT NULL,
  balance_after_usd NUMERIC(12, 4) NOT NULL,
  reason            TEXT NOT NULL,
  ref_type          TEXT,
  ref_id            TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user
  ON wireline_credit_ledger (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wireline_credit_ledger_ref_key
  ON wireline_credit_ledger (user_id, ref_type, ref_id);

ALTER TABLE wireline_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wireline_credit_ledger;
CREATE POLICY tenant_isolation ON wireline_credit_ledger
  FOR ALL
  USING (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  WITH CHECK (user_id = (SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid));
