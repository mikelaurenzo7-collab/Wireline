-- 0160: make tenant audit erasure atomic with the authoritative user delete.
--
-- The historical foreign key used ON DELETE SET NULL. An audit writer that
-- committed after the explicit audit sweep but before the user delete could
-- therefore survive as a NULL-owned row containing tenant PII. CASCADE makes
-- the user row the final race-proof erasure boundary: earlier/in-flight rows
-- are removed with it, while later inserts fail the foreign key. The terminal
-- pseudonymous receipt is intentionally inserted afterward with user_id NULL.

SET lock_timeout = '5s';

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.wireline_audit_log'::regclass
       AND conname = 'fk_audit_log_user_id'
  ) THEN
    ALTER TABLE public.wireline_audit_log
      DROP CONSTRAINT fk_audit_log_user_id;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.wireline_audit_log'::regclass
       AND constraint_row.conname = 'wireline_audit_log_user_id_wireline_users_id_fk'
       AND NOT (
         constraint_row.contype = 'f'
         AND constraint_row.confrelid = 'public.wireline_users'::regclass
         AND constraint_row.confdeltype = 'c'
         AND constraint_row.conkey = ARRAY[(
           SELECT attnum
             FROM pg_attribute
            WHERE attrelid = 'public.wireline_audit_log'::regclass
              AND attname = 'user_id'
         )]::smallint[]
         AND constraint_row.confkey = ARRAY[(
           SELECT attnum
             FROM pg_attribute
            WHERE attrelid = 'public.wireline_users'::regclass
              AND attname = 'id'
         )]::smallint[]
       )
  ) THEN
    ALTER TABLE public.wireline_audit_log
      DROP CONSTRAINT wireline_audit_log_user_id_wireline_users_id_fk;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.wireline_audit_log'::regclass
       AND conname = 'wireline_audit_log_user_id_wireline_users_id_fk'
  ) THEN
    ALTER TABLE public.wireline_audit_log
      ADD CONSTRAINT wireline_audit_log_user_id_wireline_users_id_fk
      FOREIGN KEY (user_id)
      REFERENCES public.wireline_users(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE public.wireline_audit_log
  VALIDATE CONSTRAINT wireline_audit_log_user_id_wireline_users_id_fk;

RESET lock_timeout;
