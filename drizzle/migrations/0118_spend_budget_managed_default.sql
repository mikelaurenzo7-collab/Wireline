-- 0118 — preserve customer-selected provider spend limits across plan changes.
--
-- Existing rows default to customer-managed because prior schema did not
-- record provenance. New application-seeded rows opt into managed defaults;
-- a customer save clears that flag. This prevents an exact $0.50 customer
-- choice from being mistaken for the former free-plan seed after an upgrade.
--
-- Additive, idempotent, and safe to apply before the application deploys.

ALTER TABLE public.wireline_spend_budgets
  ADD COLUMN IF NOT EXISTS managed_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.wireline_spend_budgets.managed_default IS
  'True only while Wireline may move this budget with the active plan; customer edits set false.';
