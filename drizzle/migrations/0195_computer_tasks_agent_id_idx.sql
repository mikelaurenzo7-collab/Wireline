-- 0195: index computer tasks by agent.
-- idx_computer_tasks_user_agent_created leads with user_id, so an agent-scoped
-- lookup cannot use it. Journal only. Apply through the controlled schema
-- promotion, not from application startup.

CREATE INDEX IF NOT EXISTS idx_computer_tasks_agent_id
  ON public.wireline_computer_tasks USING btree (agent_id);
