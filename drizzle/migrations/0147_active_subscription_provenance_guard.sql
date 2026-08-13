-- 0147: New active entitlements must carry verifiable provenance.
--
-- NOT VALID deliberately avoids rewriting or auto-legitimizing historical
-- grants during deploy. PostgreSQL still enforces the check for every new or
-- updated row; the read-only reconciliation report remains the operator path
-- for reviewing any older exception before the constraint is validated.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wireline_subscriptions_active_provenance_check'
      AND conrelid = 'public.wireline_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.wireline_subscriptions
      ADD CONSTRAINT wireline_subscriptions_active_provenance_check
      CHECK (
        status NOT IN ('active', 'trialing')
        OR (
          entitlement_source = 'stripe'
          AND stripe_customer_id IS NOT NULL
          AND stripe_subscription_id IS NOT NULL
        )
        OR (
          entitlement_source <> 'stripe'
          AND NULLIF(BTRIM(grant_reason), '') IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;
