-- 0145 — reconcile historical user-owned rows left by pre-hardening deletions.
--
-- Wireline's current purgeAccount registry explicitly deletes these tables when
-- an account reaches its terminal purge. Live verification on 2026-08-11 found
-- a small historical residue created before that registry became complete:
--   - director conversation messages
--   - per-user DNC rows
--   - user audit rows
--   - the legacy training backup table
--
-- Delete only rows whose referenced Wireline user no longer exists. System job
-- history is intentionally excluded: recurring platform jobs use the all-zero
-- UUID sentinel rather than a customer user and are valid operational history.

DELETE FROM public.wireline_director_conversation_messages AS row
WHERE row.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = row.user_id
  );

DELETE FROM public.wireline_dnc_list AS row
WHERE row.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = row.user_id
  );

DELETE FROM public.wireline_audit_log AS row
WHERE row.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = row.user_id
  );

DELETE FROM public.wireline_training_backup_20260609 AS row
WHERE row.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.wireline_users AS users WHERE users.id = row.user_id
  );
