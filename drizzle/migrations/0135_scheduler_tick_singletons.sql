-- 0135: prevent scheduler backlog amplification.
--
-- The five-minute sweep emits cadence_tick and callback_tick as global sentinel
-- jobs. If execution is delayed, blindly inserting another pair each sweep
-- creates semantically redundant waiting work and can amplify the queue faster
-- than it drains. Collapse historical queued duplicates, then permit at most one
-- pending/retryable successor per owner/type. A currently running tick is never
-- rewritten by migration: its handler may already be producing side effects,
-- while one queued successor preserves periodic catch-up after a long sweep.

LOCK TABLE public.wireline_jobs IN SHARE ROW EXCLUSIVE MODE;

WITH ranked_queued_ticks AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type
      ORDER BY COALESCE(run_at, created_at), id
    ) AS queued_rank
  FROM public.wireline_jobs
  WHERE type IN ('cadence_tick', 'callback_tick')
    AND status IN ('pending', 'failed')
)
UPDATE public.wireline_jobs AS jobs
SET
  status = 'done',
  finished_at = COALESCE(jobs.finished_at, now()),
  error = 'Superseded duplicate queued scheduler tick',
  updated_at = now()
FROM ranked_queued_ticks AS ranked
WHERE jobs.id = ranked.id
  AND ranked.queued_rank > 1
  AND jobs.status IN ('pending', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_queued_scheduler_tick
  ON public.wireline_jobs USING btree (user_id, type)
  WHERE type IN ('cadence_tick', 'callback_tick')
    AND status IN ('pending', 'failed');

COMMENT ON INDEX public.uq_jobs_queued_scheduler_tick IS
  'At most one queued cadence or callback scheduler successor per owner and type.';
