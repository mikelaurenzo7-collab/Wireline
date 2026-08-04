-- Read-only operator audit for active subscription entitlement provenance.
--
-- Returns only rows that require human review. Never auto-revoke access from
-- this result: confirm the intended grant with the account owner first.

SELECT
  user_id,
  plan,
  status,
  entitlement_source,
  grant_reason,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  updated_at,
  CASE
    WHEN entitlement_source = 'stripe'
      AND (stripe_customer_id IS NULL OR stripe_subscription_id IS NULL)
      THEN 'stripe entitlement missing customer/subscription id'
    WHEN entitlement_source <> 'stripe'
      AND NULLIF(BTRIM(grant_reason), '') IS NULL
      THEN 'non-stripe entitlement missing grant reason'
    ELSE 'review'
  END AS finding
FROM public.wireline_subscriptions
WHERE status IN ('active', 'trialing')
  AND (
    (
      entitlement_source = 'stripe'
      AND (stripe_customer_id IS NULL OR stripe_subscription_id IS NULL)
    )
    OR (
      entitlement_source <> 'stripe'
      AND NULLIF(BTRIM(grant_reason), '') IS NULL
    )
  )
ORDER BY updated_at DESC NULLS LAST, user_id;
