-- 0146: Align Wireline-managed paid AI budgets with the launch-safe catalog.
--
-- Voice capacity, Runtime Allowance, and the AI-spend envelope are independent
-- meters and can all be consumed in one month. The earlier paid default reused
-- the voice reserve, which made simultaneous legitimate use exceed the catalog's
-- certified COGS. Preserve every Account Holder-selected limit; move only rows
-- that still declare Wireline-managed provenance.

WITH latest_paid_subscription AS (
  SELECT DISTINCT ON (subscription.user_id)
    subscription.user_id,
    lower(COALESCE(subscription.plan, '')) AS plan
  FROM public.wireline_subscriptions AS subscription
  WHERE lower(COALESCE(subscription.status, '')) IN ('active', 'trialing')
  ORDER BY
    subscription.user_id,
    subscription.updated_at DESC NULLS LAST,
    subscription.created_at DESC NULLS LAST
)
UPDATE public.wireline_spend_budgets AS budget
SET
  monthly_limit_usd = CASE
    WHEN subscription.plan IN (
      'enterprise', 'scale', 'custom', 'growth', 'business-plus'
    ) THEN 12.00
    WHEN subscription.plan IN (
      'business', 'pro', 'business-growth'
    ) THEN 6.00
    WHEN subscription.plan IN (
      'team', 'shared', 'starter-plus', 'starterplus', 'plus'
    ) THEN 3.00
    WHEN subscription.plan IN (
      'starter', 'business-starter', 'businessstarter', 'business-lite',
      'lite', 'personal-plus', 'solo', 'starter-9'
    ) THEN 1.50
    ELSE budget.monthly_limit_usd
  END,
  hard_cap = true,
  enabled = true,
  updated_at = now()
FROM latest_paid_subscription AS subscription
WHERE budget.user_id = subscription.user_id
  AND budget.managed_default = true
  AND subscription.plan IN (
    'enterprise', 'scale', 'custom', 'growth', 'business-plus',
    'business', 'pro', 'business-growth',
    'team', 'shared', 'starter-plus', 'starterplus', 'plus',
    'starter', 'business-starter', 'businessstarter', 'business-lite',
    'lite', 'personal-plus', 'solo', 'starter-9'
  );

COMMENT ON COLUMN public.wireline_spend_budgets.monthly_limit_usd IS
  'Monthly managed-provider spend limit in USD. Free Builder defaults to $1.50 for private simulation; paid defaults come from the independently margin-reserved catalog AI allowance.';
