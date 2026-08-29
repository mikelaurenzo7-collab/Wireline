-- One retryable paid-identity workflow may own a Bot at a time. Completed or
-- dead rows intentionally leave the predicate so later Stripe reconciliation
-- can repair deleted or previously exhausted provider resources.
SET lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_paid_bot_identity_active
  ON public.wireline_jobs USING btree (user_id, ((payload->>'agentId')))
  WHERE type = 'paid_bot_identity_reconcile'
    AND (payload->>'agentId') IS NOT NULL
    AND status IN ('pending', 'running', 'failed');

RESET lock_timeout;
