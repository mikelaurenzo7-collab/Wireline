-- 0141: prevent scheduler backlog amplification.
--
-- The five-minute sweep emits cadence_tick and callback_tick as global sentinel
-- jobs. If execution is delayed, blindly inserting another pair each sweep
-- creates semantically redundant work and can amplify the queue faster than it
-- drains. Collapse queued duplicates around any preferred running tick, then
-- enforce one active row per owner/type. Running rows are never rewritten: a
-- handler may already be producing side effects. An unsafe preexisting duplicate
-- runner aborts the migration for operator review instead of being mislabeled.

LOCK TABLE public.wireline_jobs IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.wireline_jobs
    WHERE type IN ('cadence_tick', 'callback_tick')
      AND status = 'running'
    GROUP BY user_id, type
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce scheduler singleton while duplicate cadence/callback ticks are running';
  END IF;
END
$$;

WITH ranked_active_ticks AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type
      ORDER BY
        CASE WHEN status = 'running' THEN 0 ELSE 1 END,
        COALESCE(run_at, created_at),
        id
    ) AS active_rank
  FROM public.wireline_jobs
  WHERE type IN ('cadence_tick', 'callback_tick')
    AND status IN ('pending', 'running', 'failed')
)
UPDATE public.wireline_jobs AS jobs
SET
  status = 'done',
  finished_at = COALESCE(jobs.finished_at, now()),
  error = 'Superseded duplicate singleton scheduler tick',
  updated_at = now()
FROM ranked_active_ticks AS ranked
WHERE jobs.id = ranked.id
  AND ranked.active_rank > 1
  AND jobs.status IN ('pending', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_queued_scheduler_tick
  ON public.wireline_jobs USING btree (user_id, type)
  WHERE type IN ('cadence_tick', 'callback_tick')
    AND status IN ('pending', 'running', 'failed');

COMMENT ON INDEX public.uq_jobs_queued_scheduler_tick IS
  'At most one claimable/running cadence or callback scheduler tick per owner and type.';
