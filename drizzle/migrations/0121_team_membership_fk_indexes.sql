-- 0121 — covering indexes for membership foreign keys surfaced by the
-- Supabase performance advisor after migration 0120.

CREATE INDEX IF NOT EXISTS idx_team_members_user_id
  ON public.wireline_team_members (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_invited_by
  ON public.wireline_team_members (invited_by)
  WHERE invited_by IS NOT NULL;
