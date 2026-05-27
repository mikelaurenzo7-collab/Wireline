ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS signup_plan_interest text,
  ADD COLUMN IF NOT EXISTS signup_wedge text,
  ADD COLUMN IF NOT EXISTS acquisition_source text,
  ADD COLUMN IF NOT EXISTS acquisition_medium text,
  ADD COLUMN IF NOT EXISTS acquisition_campaign text;
