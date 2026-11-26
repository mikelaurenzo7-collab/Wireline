ALTER TABLE public.wireline_agent_conversation_messages
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS project_name text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_conv_thread
  ON public.wireline_agent_conversation_messages (user_id, agent_id, thread_id, id);
