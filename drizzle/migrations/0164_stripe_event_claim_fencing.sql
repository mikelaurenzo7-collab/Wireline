-- 0164: fence Stripe webhook ownership and align recovery with the runtime ceiling.
--
-- The monolithic Vercel function may run for 600 seconds, but migration 0132
-- reclaimed a processing row after five minutes. A redelivery could therefore
-- start while the original owner was alive, and the original handler could
-- later mark or delete the replacement because ownership was keyed only by
-- event_id. A per-attempt UUID fences completion/release, while a 15-minute
-- lease exceeds the runtime ceiling by five minutes.

SET lock_timeout = '5s';

ALTER TABLE public.wireline_stripe_events
  ADD COLUMN IF NOT EXISTS claim_token uuid;

COMMENT ON COLUMN public.wireline_stripe_events.claim_token IS
  'Per-attempt ownership fence while status is processing; cleared on completion.';

CREATE OR REPLACE FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'processing' THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.wireline_stripe_events
  WHERE event_id = NEW.event_id
    AND status = 'processing'
    AND (
      processed_at IS NULL
      OR processed_at < clock_timestamp() - INTERVAL '15 minutes'
    );

  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE preserves ACLs. Keep this trigger helper unavailable as a
-- direct Data API function even on databases with drifted default grants.
REVOKE ALL ON FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS wireline_reclaim_abandoned_stripe_event_claim_before_insert
  ON public.wireline_stripe_events;

CREATE TRIGGER wireline_reclaim_abandoned_stripe_event_claim_before_insert
BEFORE INSERT ON public.wireline_stripe_events
FOR EACH ROW
EXECUTE FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim();

RESET lock_timeout;
