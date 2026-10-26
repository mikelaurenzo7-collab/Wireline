-- Bot pictures are a 120-entry catalog, not a workspace capacity.
-- Drop the per-workspace unique mark so another Bot can reuse a picture.
-- The catalog check constraint stays: a mark must still be one of the curated pictures.
-- Replay is safe: dropping a missing index is a no-op.
SET lock_timeout = '5s';
--> statement-breakpoint
DROP INDEX IF EXISTS public.uq_wireline_agents_user_mark_key;
--> statement-breakpoint
COMMENT ON COLUMN public.wireline_agents.mark_key IS
  'Customer-selected Bot picture from the curated catalog. Pictures may repeat inside a workspace.';
--> statement-breakpoint
RESET lock_timeout;
