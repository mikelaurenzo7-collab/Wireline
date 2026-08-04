-- Canonical subscription-entitlement provenance.
--
-- Production received the provenance columns through an out-of-band launch
-- hardening apply. This migration remains idempotent while adding one durable
-- write invariant: a row carrying a Stripe subscription ID is classified as
-- Stripe-backed before commit, even when older application code omits the
-- provenance fields.

ALTER TABLE public.wireline_subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_source text,
  ADD COLUMN IF NOT EXISTS grant_reason text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Classify legacy rows before enforcing NOT NULL. A Stripe subscription ID is
-- authoritative evidence of provider-backed access; every other historical row
-- is explicitly marked as a migration grant for later operator review.
UPDATE public.wireline_subscriptions
SET entitlement_source = CASE
  WHEN stripe_subscription_id IS NOT NULL THEN 'stripe'
  ELSE 'migration'
END
WHERE entitlement_source IS NULL;

ALTER TABLE public.wireline_subscriptions
  ALTER COLUMN entitlement_source SET DEFAULT 'manual',
  ALTER COLUMN entitlement_source SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wireline_subscriptions_entitlement_source_check'
      AND conrelid = 'public.wireline_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.wireline_subscriptions
      ADD CONSTRAINT wireline_subscriptions_entitlement_source_check
      CHECK (entitlement_source IN ('stripe', 'demo', 'manual', 'migration'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wireline_subscriptions_entitlement_source
  ON public.wireline_subscriptions USING btree (entitlement_source);

CREATE OR REPLACE FUNCTION public.wireline_set_subscription_entitlement_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.stripe_subscription_id IS NOT NULL THEN
    NEW.entitlement_source := 'stripe';
    NEW.grant_reason := NULL;
  ELSIF NEW.entitlement_source IS NULL THEN
    NEW.entitlement_source := 'manual';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wireline_subscriptions_set_entitlement_source
  ON public.wireline_subscriptions;
CREATE TRIGGER wireline_subscriptions_set_entitlement_source
BEFORE INSERT OR UPDATE OF stripe_subscription_id, entitlement_source
ON public.wireline_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.wireline_set_subscription_entitlement_source();
