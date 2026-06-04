-- Tenant business context fields referenced by Director + template overlays.
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS primary_product text,
  ADD COLUMN IF NOT EXISTS business_hours jsonb;
