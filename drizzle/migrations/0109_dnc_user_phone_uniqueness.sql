-- Legal opt-outs must be idempotent and must never fail because the same
-- consumer has already been suppressed. The live agent path uses
-- ON CONFLICT (user_id, phone), which requires a matching unique index.
--
-- Preserve the earliest suppression record for each tenant/number pair before
-- creating the constraint. The earliest record is the strongest audit evidence
-- of when the consumer first opted out; later duplicates add no suppression
-- value and prevent a safe unique index from being created.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, phone
      ORDER BY created_at ASC NULLS FIRST, id ASC
    ) AS duplicate_rank
  FROM public.wireline_dnc_list
)
DELETE FROM public.wireline_dnc_list AS dnc
USING ranked
WHERE dnc.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS wireline_dnc_list_user_phone_unique
  ON public.wireline_dnc_list USING btree (user_id, phone);
