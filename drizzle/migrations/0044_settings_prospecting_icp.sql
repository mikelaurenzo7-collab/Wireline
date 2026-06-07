-- Growth Engine ICP targeting columns (schema drift fix).
ALTER TABLE wireline_settings
  ADD COLUMN IF NOT EXISTS prospecting_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_titles jsonb,
  ADD COLUMN IF NOT EXISTS target_industries jsonb,
  ADD COLUMN IF NOT EXISTS target_states jsonb,
  ADD COLUMN IF NOT EXISTS target_employee_ranges jsonb;
