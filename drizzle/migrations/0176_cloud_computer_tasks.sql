-- 0176 — per-Bot cloud computer task ledger.
--
-- One row per owner-assigned task on a Bot's cloud computer. It carries the
-- goal, lifecycle, a bounded owner-readable activity log, and the final report.
-- Screenshots and model transcripts are never stored here. Rows belong to one
-- tenant and are erased with the account or the Bot.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.wireline_computer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES public.wireline_users(id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES public.wireline_agents(id) ON DELETE CASCADE,
  goal text NOT NULL,
  start_url text,
  status text DEFAULT 'running' NOT NULL,
  summary text,
  question text,
  sources jsonb DEFAULT '[]'::jsonb NOT NULL,
  events jsonb DEFAULT '[]'::jsonb NOT NULL,
  error_code text,
  model text,
  turn_count integer DEFAULT 0 NOT NULL,
  action_count integer DEFAULT 0 NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT wireline_computer_tasks_status_check
    CHECK (status IN ('running', 'needs_input', 'completed', 'blocked', 'failed', 'stopped', 'interrupted')),
  CONSTRAINT wireline_computer_tasks_goal_length_check
    CHECK (char_length(goal) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_computer_tasks_user_agent_created
  ON public.wireline_computer_tasks USING btree (user_id, agent_id, created_at);

-- One active task per account, enforced across every API process.
CREATE UNIQUE INDEX IF NOT EXISTS uq_computer_tasks_one_active_per_user
  ON public.wireline_computer_tasks USING btree (user_id)
  WHERE status IN ('running', 'needs_input');

ALTER TABLE public.wireline_computer_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wireline_computer_tasks FROM PUBLIC;
REVOKE ALL ON TABLE public.wireline_computer_tasks FROM anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_computer_tasks;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.wireline_computer_tasks TO wireline_server;

    CREATE POLICY tenant_isolation
      ON public.wireline_computer_tasks
      FOR ALL TO wireline_server
      USING (user_id = (SELECT public.wireline_current_user_id()))
      WITH CHECK (user_id = (SELECT public.wireline_current_user_id()));
  END IF;
END
$$;

COMMENT ON TABLE public.wireline_computer_tasks IS
  'Owner-assigned cloud computer tasks per Bot: goal, lifecycle, bounded activity log and final report. No screenshots or model transcripts.';

RESET lock_timeout;
