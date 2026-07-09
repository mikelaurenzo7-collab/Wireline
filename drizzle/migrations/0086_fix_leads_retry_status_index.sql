-- Align next-attempt partial index with LEAD_STATUS.RETRYING ("Retrying").
-- Legacy predicate used 'Retry' / lowercase variants that never match live rows.
DROP INDEX IF EXISTS idx_leads_status_next_attempt;

CREATE INDEX IF NOT EXISTS idx_leads_status_next_attempt
  ON wireline_outbound_leads USING btree (status, callback_scheduled_at)
  WHERE status IN ('Pending', 'Retrying');
