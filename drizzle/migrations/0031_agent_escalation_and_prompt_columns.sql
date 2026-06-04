-- 0031: Agent column drift — columns referenced in Drizzle schema but missing in prod.
-- Without these, SELECT * via Drizzle on wireline_agents 500s and /api/agents returns 503.

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS system_prompt_override text;

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS escalation_phone text;

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS escalation_email text;

ALTER TABLE wireline_agents
  ADD COLUMN IF NOT EXISTS escalation_handoff_enabled boolean DEFAULT false;
