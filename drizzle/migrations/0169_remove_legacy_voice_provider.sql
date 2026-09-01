-- 0169 — retire the unused legacy voice-provider data plane.
--
-- Production was inventoried before this migration was authored: the legacy
-- voice table contained zero rows and no Bot referenced a non-OpenAI phone
-- voice. Customer browser and phone speech is now exclusively the documented
-- OpenAI Realtime voice catalog.

SET lock_timeout = '5s';

DO $$
DECLARE
  has_rows boolean := false;
BEGIN
  IF to_regclass('public.wireline_cloned_voices') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.wireline_cloned_voices)'
      INTO has_rows;
  END IF;

  IF has_rows THEN
    RAISE EXCEPTION
      'Refusing to retire the legacy voice provider while mapped voice assets still exist';
  END IF;
END
$$;

-- Migration 0163's production-promotion preflight counted this table directly.
-- Reconcile that canonical function before removing the table so promotions do
-- not fail with undefined_table after the provider ledger is retired.
DO $reconcile_legacy_voice_preflight$
DECLARE
  function_definition text;
  reconciled_definition text;
BEGIN
  SELECT pg_get_functiondef(
    to_regprocedure('public.wireline_account_environment_promotion_preflight(uuid)')
  )
  INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION
      '0169 refused: account-environment promotion preflight is missing';
  END IF;

  reconciled_definition := replace(
    function_definition,
    $legacy_voice_count$+ (
          SELECT count(*)
          FROM public.wireline_cloned_voices
          WHERE user_id = p_user_id
            AND (voice_id IS NOT NULL OR preview_url IS NOT NULL)
        )$legacy_voice_count$,
    ''
  );

  IF position('wireline_cloned_voices' IN reconciled_definition) > 0 THEN
    RAISE EXCEPTION
      '0169 refused: could not remove the retired voice table from the promotion preflight';
  END IF;

  IF reconciled_definition IS DISTINCT FROM function_definition THEN
    EXECUTE reconciled_definition;
  END IF;
END
$reconcile_legacy_voice_preflight$;

DROP TABLE IF EXISTS public.wireline_cloned_voices;
DROP FUNCTION IF EXISTS public.wireline_revoke_cloned_voice_assignments();

RESET lock_timeout;
