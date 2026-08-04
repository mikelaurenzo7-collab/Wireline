-- Canonical subscription-entitlement provenance.
--
-- Production received these columns through an out-of-band launch hardening
-- apply. Keep this migration idempotent so existing production is a no-op while
-- fresh/preview databases reproduce the same auditable billing contract.

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
