-- 0143 — make every agent/account relationship tenant-correct at the database boundary.
--
-- Account separation shipped with a one-time backfill, but current web, mobile,
-- MCP, and founder creation paths remained user-scoped and could still insert
-- wireline_agents.account_id = NULL. Live verification on 2026-08-11 found 18
-- such rows, including the sole production-classified workspace's agent.
--
-- Runtime authorization is still user-scoped today, so this is not a current
-- cross-tenant exposure. It is nevertheless a broken ownership invariant that
-- would become dangerous the moment account-scoped filtering is enforced.
--
-- This migration:
--   1) backfills every NULL binding to the user's primary (or oldest) account;
--   2) refuses any existing cross-user binding rather than guessing;
--   3) installs one database trigger covering every current/future insert path;
--   4) auto-resolves omitted account ids to the same deterministic primary
--      account while rejecting an explicitly supplied foreign account id.
--
-- The column remains nullable in Drizzle for compatibility with the current
-- user-scoped application model, but the trigger makes persisted NULL values
-- impossible while enabled. This avoids schema/type drift until account-level
-- authorization is intentionally completed end-to-end.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.wireline_agents a
    JOIN public.wireline_accounts wa ON wa.id = a.account_id
    WHERE wa.user_id IS DISTINCT FROM a.user_id
  ) THEN
    RAISE EXCEPTION 'Refusing agent account backfill: existing cross-user binding detected';
  END IF;
END
$$;

UPDATE public.wireline_agents AS a
SET account_id = (
  SELECT wa.id
  FROM public.wireline_accounts wa
  WHERE wa.user_id = a.user_id
  ORDER BY wa.is_primary DESC, wa.created_at ASC NULLS LAST, wa.id ASC
  LIMIT 1
)
WHERE a.account_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wireline_agents WHERE account_id IS NULL) THEN
    RAISE EXCEPTION 'Refusing agent account invariant: one or more users have no account to bind';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.wireline_enforce_agent_account_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_account_id uuid;
BEGIN
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Agent user_id is required'
      USING ERRCODE = '23502';
  END IF;

  IF NEW.account_id IS NULL THEN
    SELECT wa.id
      INTO resolved_account_id
      FROM public.wireline_accounts wa
     WHERE wa.user_id = NEW.user_id
     ORDER BY wa.is_primary DESC, wa.created_at ASC NULLS LAST, wa.id ASC
     LIMIT 1;

    IF resolved_account_id IS NULL THEN
      RAISE EXCEPTION 'Agent owner has no account to bind'
        USING ERRCODE = '23503';
    END IF;

    NEW.account_id := resolved_account_id;
    RETURN NEW;
  END IF;

  PERFORM 1
    FROM public.wireline_accounts wa
   WHERE wa.id = NEW.account_id
     AND wa.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent account does not belong to agent owner'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.wireline_enforce_agent_account_binding() FROM PUBLIC;

DROP TRIGGER IF EXISTS wireline_agents_account_binding_guard ON public.wireline_agents;
CREATE TRIGGER wireline_agents_account_binding_guard
BEFORE INSERT OR UPDATE OF user_id, account_id
ON public.wireline_agents
FOR EACH ROW
EXECUTE FUNCTION public.wireline_enforce_agent_account_binding();
