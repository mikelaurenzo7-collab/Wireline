-- 0172 — remove the empty retired xAI phone-voice registration ledger.
--
-- OpenAI Realtime is the only live-call runtime. The former xAI registration
-- table was retained solely for safe retirement of ambiguous provider
-- resources; live inventory verified zero rows before this migration was
-- authored. Fail closed if any row appears before promotion.

SET lock_timeout = '5s';

DO $retired_xai_inventory$
DECLARE
  has_rows boolean := false;
BEGIN
  IF to_regclass('public.wireline_xai_phone_bindings') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.wireline_xai_phone_bindings)'
      INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION
        '0172 refused: retired xAI phone binding inventory is no longer empty';
    END IF;
  END IF;
END
$retired_xai_inventory$;

-- The guarded production-promotion preflight predates both retired provider
-- table removals. Reconcile its stored SQL definition before dropping the xAI
-- ledger. Removing the legacy-voice fragment again also repairs an environment
-- where 0169 was applied manually before this reconciliation shipped.
DO $reconcile_retired_provider_preflight$
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
      '0172 refused: account-environment promotion preflight is missing';
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
  reconciled_definition := replace(
    reconciled_definition,
    $retired_xai_count$+ (SELECT count(*) FROM public.wireline_xai_phone_bindings WHERE user_id = p_user_id)$retired_xai_count$,
    ''
  );
  reconciled_definition := replace(
    reconciled_definition,
    $managed_voice_count$+ (
          SELECT count(*)
          FROM public.wireline_agents
          WHERE user_id = p_user_id
            AND (
              voice_id IS NOT NULL
              OR voice_id_inbound IS NOT NULL
              OR voice_id_outbound IS NOT NULL
              OR secondary_voice_id IS NOT NULL
              OR phone_voice_id IS NOT NULL
              OR video_presenter_avatar_id IS NOT NULL
            )
        )$managed_voice_count$,
    $presenter_resource_count$+ (
          SELECT count(*)
          FROM public.wireline_agents
          WHERE user_id = p_user_id
            AND video_presenter_avatar_id IS NOT NULL
        )$presenter_resource_count$
  );

  IF position('wireline_cloned_voices' IN reconciled_definition) > 0
     OR position('wireline_xai_phone_bindings' IN reconciled_definition) > 0 THEN
    RAISE EXCEPTION
      '0172 refused: could not remove retired provider tables from the promotion preflight';
  END IF;
  IF position('voice_id IS NOT NULL' IN reconciled_definition) > 0
     OR position('voice_id_inbound IS NOT NULL' IN reconciled_definition) > 0
     OR position('voice_id_outbound IS NOT NULL' IN reconciled_definition) > 0
     OR position('secondary_voice_id IS NOT NULL' IN reconciled_definition) > 0
     OR position('phone_voice_id IS NOT NULL' IN reconciled_definition) > 0 THEN
    RAISE EXCEPTION
      '0172 refused: managed OpenAI catalog voices still block production promotion';
  END IF;

  IF reconciled_definition IS DISTINCT FROM function_definition THEN
    EXECUTE reconciled_definition;
  END IF;
END
$reconcile_retired_provider_preflight$;

DROP FUNCTION IF EXISTS public.wireline_claim_xai_phone_binding(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.wireline_claim_xai_phone_deactivation(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.wireline_retire_xai_phone_binding(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.wireline_scrub_xai_phone_bindings_for_purge(uuid);

DROP TABLE IF EXISTS public.wireline_xai_phone_bindings;

RESET lock_timeout;
