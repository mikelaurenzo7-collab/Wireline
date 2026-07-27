-- 0107: Every tenant must have a persisted provider-spend guard.
--
-- Historical/demo accounts can predate the signup seeding path. The runtime
-- previously interpreted a missing row as "no hard cap" while the UI displayed
-- a synthetic plan default. Backfill only absent rows, preserve every existing
-- Account Holder choice, and make malformed active hard caps impossible.

UPDATE public.wireline_spend_budgets
SET
  monthly_limit_usd = COALESCE(monthly_limit_usd, 0.50),
  hard_cap = COALESCE(hard_cap, true),
  warn_threshold_pct = COALESCE(warn_threshold_pct, 80),
  enabled = COALESCE(enabled, true),
  updated_at = COALESCE(updated_at, now())
WHERE
  monthly_limit_usd IS NULL
  OR hard_cap IS NULL
  OR warn_threshold_pct IS NULL
  OR enabled IS NULL
  OR updated_at IS NULL;

WITH latest_subscription AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    lower(COALESCE(plan, '')) AS plan
  FROM public.wireline_subscriptions
  ORDER BY user_id, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
)
INSERT INTO public.wireline_spend_budgets (
  user_id,
  monthly_limit_usd,
  hard_cap,
  warn_threshold_pct,
  enabled,
  updated_at
)
SELECT
  users.id,
  CASE
    WHEN subscription.plan IN (
      'enterprise', 'scale', 'custom', 'growth', 'business-plus'
    ) THEN 69.60
    WHEN subscription.plan IN (
      'business', 'pro', 'business-growth'
    ) THEN 38.00
    WHEN subscription.plan IN (
      'team', 'shared', 'starter-plus', 'starterplus', 'plus'
    ) THEN 18.36
    WHEN subscription.plan IN (
      'starter', 'business-starter', 'businessstarter', 'business-lite',
      'lite', 'personal-plus', 'solo', 'starter-9'
    ) THEN 8.68
    ELSE 0.50
  END,
  true,
  80,
  true,
  now()
FROM public.wireline_users AS users
LEFT JOIN latest_subscription AS subscription
  ON subscription.user_id = users.id
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.wireline_spend_budgets
  ALTER COLUMN monthly_limit_usd SET DEFAULT 0.50,
  ALTER COLUMN monthly_limit_usd SET NOT NULL,
  ALTER COLUMN hard_cap SET DEFAULT true,
  ALTER COLUMN hard_cap SET NOT NULL,
  ALTER COLUMN warn_threshold_pct SET DEFAULT 80,
  ALTER COLUMN warn_threshold_pct SET NOT NULL,
  ALTER COLUMN enabled SET DEFAULT true,
  ALTER COLUMN enabled SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wireline_spend_budgets_valid_guard'
      AND conrelid = 'public.wireline_spend_budgets'::regclass
  ) THEN
    ALTER TABLE public.wireline_spend_budgets
      ADD CONSTRAINT wireline_spend_budgets_valid_guard
      CHECK (
        monthly_limit_usd >= 0
        AND warn_threshold_pct BETWEEN 1 AND 99
        AND (NOT enabled OR NOT hard_cap OR monthly_limit_usd > 0)
      );
  END IF;
END
$$;
