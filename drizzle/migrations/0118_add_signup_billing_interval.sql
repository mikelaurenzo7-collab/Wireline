-- Preserve the billing term a visitor selected before account creation.
-- Nullable keeps existing accounts backward-compatible; the check prevents
-- malformed attribution from becoming a checkout default.
ALTER TABLE public.wireline_settings
  ADD COLUMN IF NOT EXISTS signup_billing_interval text;

ALTER TABLE public.wireline_settings
  DROP CONSTRAINT IF EXISTS wireline_settings_signup_billing_interval_check;

ALTER TABLE public.wireline_settings
  ADD CONSTRAINT wireline_settings_signup_billing_interval_check
  CHECK (
    signup_billing_interval IS NULL
    OR signup_billing_interval IN ('month', 'year')
  );
