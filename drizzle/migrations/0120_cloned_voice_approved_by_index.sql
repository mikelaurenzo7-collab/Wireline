-- 0120 — cover the durable clone-approval foreign key.
--
-- Reviewer deletion is intentionally restricted while approval evidence is
-- live. Covering approved_by avoids a full cloned-voice scan when Postgres
-- enforces that foreign key.

CREATE INDEX IF NOT EXISTS idx_cloned_voices_approved_by
  ON public.wireline_cloned_voices USING btree (approved_by);
