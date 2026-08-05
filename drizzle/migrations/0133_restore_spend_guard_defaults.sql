-- 0133: Restore the canonical signup spend-guard defaults.
--
-- Production defaults drifted out of committed migration history to $50 with
-- hard-cap enforcement disabled. That contradicted the verified signup
-- contract established by migration 0107 and the transactional signup path.
--
-- This migration changes defaults only. It deliberately preserves every
-- existing tenant row and every Account Holder-selected budget.

ALTER TABLE public.wireline_spend_budgets
  ALTER COLUMN monthly_limit_usd SET DEFAULT 0.50,
  ALTER COLUMN hard_cap SET DEFAULT true,
  ALTER COLUMN warn_threshold_pct SET DEFAULT 80,
  ALTER COLUMN enabled SET DEFAULT true,
  ALTER COLUMN updated_at SET DEFAULT now();

COMMENT ON COLUMN public.wireline_spend_budgets.monthly_limit_usd IS
  'Monthly provider-spend limit in USD. New fallback rows default to $0.50; plan-aware application seeding may persist a higher plan-funded limit.';

COMMENT ON COLUMN public.wireline_spend_budgets.hard_cap IS
  'When true, new provider-spending work fails closed once the persisted monthly limit is reached.';
