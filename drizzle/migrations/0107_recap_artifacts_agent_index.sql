-- Cover the tenant-safe recap artifact lookup/join path flagged by the live
-- Supabase advisor. The table is currently small; this narrow index avoids
-- changing customer-facing schema or removing any workload-dependent index.
CREATE INDEX IF NOT EXISTS idx_wireline_recap_artifacts_agent_id
  ON public.wireline_recap_artifacts (agent_id);
