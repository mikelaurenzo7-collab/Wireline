-- Reclaim abandoned Stripe idempotency leases inside the canonical INSERT.
--
-- A webhook invocation can die after inserting status='processing' but before
-- marking the event processed or deleting the claim. The application must not
-- acknowledge that unfinished event, but a stale row must also not block every
-- future provider redelivery forever.
--
-- Owning recovery at the table boundary keeps one signature verification and
-- one application round trip. Exactly one concurrent INSERT can remove an
-- abandoned lease; fresh processing and processed duplicates still reach the
-- primary-key constraint and remain retry/no-op decisions for the handler.

CREATE OR REPLACE FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only canonical claim inserts may reclaim. Other status writes must never
  -- replace an existing event row through this trigger.
  IF NEW.status <> 'processing' THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.wireline_stripe_events
  WHERE event_id = NEW.event_id
    AND status = 'processing'
    AND (
      processed_at IS NULL
      OR processed_at < clock_timestamp() - INTERVAL '5 minutes'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_reclaim_abandoned_stripe_event_claim_before_insert
  ON public.wireline_stripe_events;

CREATE TRIGGER wireline_reclaim_abandoned_stripe_event_claim_before_insert
BEFORE INSERT ON public.wireline_stripe_events
FOR EACH ROW
EXECUTE FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim();
