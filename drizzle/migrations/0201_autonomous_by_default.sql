-- 0201: a Bot acts on its own unless its owner asks it to check first.
--
-- Until now a workspace started on "draft": every email, text and booking a
-- Bot wanted to make waited in a list for the owner, and nothing told the
-- owner an item was waiting. The work stopped there. BotBound exists to do
-- the work, so acting on its own is the starting point, and checking first is
-- a choice an owner can make in Set Up.
--
-- 1. New workspaces start on "auto".
-- 2. Every existing workspace moves to "auto", and existing Bots follow their
--    workspace. Verified in the live catalog on 2026-11-27: all 149
--    workspaces held the column default "draft", which no screen ever let an
--    owner choose. Bots held "inherit" (87), "supervised" (6, the value Bot
--    creation wrote, not an owner's choice) and two retired values ("high",
--    "suggest") that the runtime read as "wait for everything". There were no
--    customer accounts: every account was the founder's or a test account.
--
--    A Bot stored as "draft" is left alone. Only an owner choosing "check
--    with me before it does anything" writes that value on a Bot, and none
--    had. If one does before this runs, that choice stands.
--
-- Step 2 is a one-time correction made before launch, not a rule. The column
-- default is its marker: once the default reads "auto" this migration has run,
-- and a replay changes nothing. That keeps a later owner's choice to check
-- first safe from a second run.
--
-- The default is changed first, under a short lock timeout, so this fails fast
-- instead of queueing behind, or deadlocking with, a request that is updating
-- its own settings row.
--
-- This changes what a Bot may do without waiting. It waives nothing the law or
-- the carrier requires: consent, do-not-call, calling hours, carrier approval
-- and message review are enforced where the message is sent.
DO $$
DECLARE
  current_default text;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO current_default
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE n.nspname = 'public'
     AND c.relname = 'wireline_settings'
     AND a.attname = 'autonomy_level'
     AND NOT a.attisdropped;

  IF current_default IS NOT NULL AND position('''auto''' IN current_default) > 0 THEN
    RETURN;
  END IF;

  PERFORM set_config('lock_timeout', '5s', true);

  ALTER TABLE public."wireline_settings" ALTER COLUMN "autonomy_level" SET DEFAULT 'auto';

  UPDATE public."wireline_settings"
     SET "autonomy_level" = 'auto'
   WHERE "autonomy_level" IS DISTINCT FROM 'auto';

  UPDATE public."wireline_agents"
     SET "autonomy_level" = 'inherit'
   WHERE "autonomy_level" IS DISTINCT FROM 'inherit'
     AND "autonomy_level" IS DISTINCT FROM 'auto'
     AND "autonomy_level" IS DISTINCT FROM 'draft';
END
$$;
