-- 0128 — one spend alert per tenant, period, and threshold.
--
-- evaluateSpend claims an alert row before dispatching spend.warning /
-- spend.exceeded webhooks, relying on a uniqueness conflict to suppress
-- repeats. No unique constraint existed, so the claim could never conflict:
-- every audited call past a threshold re-dispatched the customer webhook and
-- grew the table. Collapse historical duplicates (keeping the earliest
-- firing) before enforcing the invariant the code already assumed.

DELETE FROM public.wireline_spend_alerts a
USING public.wireline_spend_alerts b
WHERE a.user_id = b.user_id
  AND a.period IS NOT DISTINCT FROM b.period
  AND a.threshold_pct IS NOT DISTINCT FROM b.threshold_pct
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_spend_alerts_user_period_threshold
  ON public.wireline_spend_alerts (user_id, period, threshold_pct);
