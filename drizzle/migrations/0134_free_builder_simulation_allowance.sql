-- 0134: Make the Free Builder model-cost limit an explicit simulation allowance.
--
-- Production audit evidence through 2026-08-05 measured 158 Director/workspace
-- turns at $0.062143 average cost. Raising the managed Free Builder allowance
-- from $0.50 to $1.50 supports roughly 24 observed average turns while keeping
-- free-account provider exposure bounded.
--
-- Preserve every Account Holder-selected budget. Only Wireline-managed rows
-- still carrying the former Free Builder default and lacking an active paid
-- plan are advanced.

ALTER TABLE public.wireline_spend_budgets
  ALTER COLUMN monthly_limit_usd SET DEFAULT 1.50;

UPDATE public.wireline_spend_budgets AS budget
SET
  monthly_limit_usd = 1.50,
  hard_cap = true,
  enabled = true,
  updated_at = now()
WHERE
  budget.managed_default = true
  AND budget.monthly_limit_usd = 0.50
  AND NOT EXISTS (
    SELECT 1
    FROM public.wireline_subscriptions AS subscription
    WHERE subscription.user_id = budget.user_id
      AND lower(COALESCE(subscription.status, '')) IN ('active', 'trialing')
      AND lower(COALESCE(subscription.plan, '')) NOT IN (
        '', 'personal', 'free', 'builder', 'free-builder'
      )
  );

COMMENT ON COLUMN public.wireline_spend_budgets.monthly_limit_usd IS
  'Monthly managed-provider spend limit in USD. Free Builder defaults to a $1.50 private-simulation allowance; paid plans are seeded from their funded provider envelope.';
