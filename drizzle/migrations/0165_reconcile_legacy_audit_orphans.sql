-- 0165: reconcile the one historical account-deletion audit orphan shape.
--
-- Migration history is immutable once published. The cascade migration 0160
-- therefore remains byte-for-byte unchanged. Older deletion code could leave
-- one final critical receipt after deleting its owner while retaining the raw
-- account UUID in both user_id and resource_id. Delete only that exact legacy
-- shape and reject every other non-null audit owner orphan.
--
-- A database that has not yet reached 0160 cannot pass 0160's FK validation
-- while such a row exists. For that specific upgrade path, an operator must run
-- this repeat-safe block as the reviewed pre-migration repair before normal
-- journal replay; the journalled 0165 replay then converges to a no-op.

SET lock_timeout = '5s';

DO $audit_orphan_reconciliation$
BEGIN
  -- Freeze audit writers for this short reconciliation so the delete and the
  -- fail-closed assertion describe one database state.
  LOCK TABLE public.wireline_audit_log IN SHARE ROW EXCLUSIVE MODE;

  DELETE FROM public.wireline_audit_log AS audit
   WHERE audit.user_id IS NOT NULL
     AND audit.event_type = 'data.account_deleted'
     AND audit.action = 'account_deleted'
     AND audit.resource_type = 'user_account'
     AND audit.severity = 'critical'
     AND audit.resource_id = audit.user_id::text
     AND NOT EXISTS (
       SELECT 1
         FROM public.wireline_users AS app_user
        WHERE app_user.id = audit.user_id
     );

  IF EXISTS (
    SELECT 1
      FROM public.wireline_audit_log AS audit
     WHERE audit.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.wireline_users AS app_user
          WHERE app_user.id = audit.user_id
       )
  ) THEN
    RAISE EXCEPTION
      '0165 refused: wireline_audit_log contains an unexpected non-null user_id orphan';
  END IF;
END
$audit_orphan_reconciliation$;

RESET lock_timeout;
