-- 0162: make the local Stripe mirror impossible to resurrect after erasure.
--
-- A delayed Stripe webhook may arrive after terminal account deletion. The
-- application now treats a missing owner as a terminal no-op, while this
-- foreign key provides the database-owned backstop: existing subscription
-- state is removed with the user and a late insert cannot recreate it.

SET lock_timeout = '5s';

DO $migration$
DECLARE
  competing_constraint record;
BEGIN
  -- Remove every historical FK on this exact ownership edge, regardless of
  -- name. A second RESTRICT/NO ACTION key would still block the intended
  -- cascade even if the canonical CASCADE key also existed.
  FOR competing_constraint IN
    SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.wireline_subscriptions'::regclass
       AND constraint_row.contype = 'f'
       AND constraint_row.confrelid = 'public.wireline_users'::regclass
       AND constraint_row.conname <>
           'wireline_subscriptions_user_id_wireline_users_id_fk'
       AND constraint_row.conkey = ARRAY[(
         SELECT attnum
           FROM pg_attribute
          WHERE attrelid = 'public.wireline_subscriptions'::regclass
            AND attname = 'user_id'
       )]::smallint[]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.wireline_subscriptions DROP CONSTRAINT %I',
      competing_constraint.conname
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.wireline_subscriptions'::regclass
       AND constraint_row.conname = 'wireline_subscriptions_user_id_wireline_users_id_fk'
       AND NOT (
         constraint_row.contype = 'f'
         AND constraint_row.confrelid = 'public.wireline_users'::regclass
         AND constraint_row.confdeltype = 'c'
         AND constraint_row.conkey = ARRAY[(
           SELECT attnum
             FROM pg_attribute
            WHERE attrelid = 'public.wireline_subscriptions'::regclass
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
    ALTER TABLE public.wireline_subscriptions
      DROP CONSTRAINT wireline_subscriptions_user_id_wireline_users_id_fk;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.wireline_subscriptions'::regclass
       AND conname = 'wireline_subscriptions_user_id_wireline_users_id_fk'
  ) THEN
    ALTER TABLE public.wireline_subscriptions
      ADD CONSTRAINT wireline_subscriptions_user_id_wireline_users_id_fk
      FOREIGN KEY (user_id)
      REFERENCES public.wireline_users(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE public.wireline_subscriptions
  VALIDATE CONSTRAINT wireline_subscriptions_user_id_wireline_users_id_fk;

RESET lock_timeout;
