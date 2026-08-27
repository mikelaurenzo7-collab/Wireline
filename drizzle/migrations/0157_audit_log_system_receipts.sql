-- 0157: codify the system-audit nullability already present in production.
--
-- Authenticated tenant rows remain scoped by user_id and RLS. Platform events
-- such as rejected pre-auth requests and terminal account-erasure receipts do
-- not have a surviving user row, so they require a NULL user_id. Migration
-- 0039 made every tenant column NOT NULL; migration 0075 then added the
-- server-only INSERT policy for these system events but omitted the matching
-- column relaxation. This repeat-safe correction closes that split.

SET lock_timeout = '5s';

ALTER TABLE public.wireline_audit_log
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.wireline_audit_log.user_id IS
  'Tenant owner for user-scoped audit events; NULL only for server-written system events and pseudonymous terminal-erasure receipts.';

-- A purge is deliberately repeat-safe. Its one-way receipt id is stable, so a
-- partial unique index makes concurrent/manual replays converge on one durable
-- terminal record instead of double-counting the same erasure.
DROP INDEX IF EXISTS public.uq_audit_account_deletion_receipt;
CREATE UNIQUE INDEX uq_audit_account_deletion_receipt
  ON public.wireline_audit_log (event_type, resource_type, resource_id)
  WHERE event_type = 'account.deletion.completed'
    AND resource_type = 'account_deletion_receipt'
    AND resource_id IS NOT NULL;

RESET lock_timeout;
