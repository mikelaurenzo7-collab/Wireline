-- 0159: retain provider verification material without retaining former owners.
--
-- xAI returns each webhook verification secret only once and currently offers
-- no registration-delete endpoint. The binding must therefore survive release,
-- but a former tenant UUID and agent id are not needed for provider teardown or
-- safe reuse. A binding-scoped sentinel preserves non-null runtime types while
-- making retired/unowned rows non-attributable and invisible to tenant RLS.

SET lock_timeout = '5s';

ALTER TABLE public.wireline_xai_phone_bindings
  DROP CONSTRAINT IF EXISTS wireline_xai_binding_owner_identity;

UPDATE public.wireline_xai_phone_bindings AS binding
   SET user_id = binding.id,
       agent_id = 'retired:' || binding.id::text,
       status = CASE WHEN binding.status = 'retired' THEN 'retired' ELSE 'error' END,
       provisioning_token = NULL,
       provisioning_claimed_at = NULL,
       last_error = CASE
         WHEN binding.last_error IN (
           'XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS',
           'XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS'
         ) THEN binding.last_error
         WHEN binding.status = 'retired' THEN NULL
         ELSE 'XAI_PHONE_OWNER_ERASED_REQUIRES_RECONCILIATION'
       END,
       updated_at = now()
 WHERE binding.status = 'retired'
    OR NOT EXISTS (
      SELECT 1 FROM public.wireline_users AS live_user WHERE live_user.id = binding.user_id
    )
    OR NOT EXISTS (
      SELECT 1
        FROM public.wireline_agents AS live_agent
       WHERE live_agent.id = binding.agent_id
         AND live_agent.user_id = binding.user_id
    );

ALTER TABLE public.wireline_xai_phone_bindings
  ADD CONSTRAINT wireline_xai_binding_owner_identity
  CHECK (
    (
      user_id = id
      AND agent_id = 'retired:' || id::text
      AND status IN ('retired', 'error')
    )
    OR
    (
      user_id <> id
      AND agent_id <> 'retired:' || id::text
      AND status <> 'retired'
    )
  );

DROP POLICY IF EXISTS tenant_isolation ON public.wireline_xai_phone_bindings;
CREATE POLICY tenant_isolation ON public.wireline_xai_phone_bindings
  FOR ALL
  USING (
    user_id = (SELECT public.wireline_current_user_id())
    AND user_id IS DISTINCT FROM id
  )
  WITH CHECK (
    user_id = (SELECT public.wireline_current_user_id())
    AND user_id IS DISTINCT FROM id
  );

-- Migration 0153's deactivation claim preserved an explicit ambiguous marker,
-- but a hard process death can happen after xAI accepted the non-idempotent
-- registration and before its one-time ids/secret were persisted. Once that
-- provisioning claim is stale, missing registration material is itself an
-- ambiguous provider outcome. Promote it while the E.164 row is locked so
-- retirement retains the only remaining correlation and blocks automatic reuse.
CREATE OR REPLACE FUNCTION public.wireline_claim_xai_phone_deactivation(
  p_user_id uuid,
  p_phone_number text,
  p_claim_token uuid
)
RETURNS TABLE(
  binding_id uuid,
  claim_token uuid,
  twilio_phone_number_sid text,
  twilio_sip_trunk_sid text,
  prior_last_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_binding public.wireline_xai_phone_bindings%ROWTYPE;
  v_prior_last_error text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_phone_number IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_INVALID_CLAIM';
  END IF;

  IF public.wireline_current_user_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'XAI_PHONE_TENANT_MISMATCH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('xai-phone:' || p_phone_number));

  PERFORM 1
    FROM public.wireline_phone_numbers AS phone
   WHERE phone.user_id = p_user_id
     AND phone.phone_number = p_phone_number
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_OWNERSHIP_MISMATCH';
  END IF;

  SELECT *
    INTO v_binding
    FROM public.wireline_xai_phone_bindings
   WHERE phone_number = p_phone_number
   FOR UPDATE;

  IF NOT FOUND OR v_binding.status = 'retired' THEN
    RETURN;
  END IF;

  IF v_binding.user_id <> p_user_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_OWNED_BY_ANOTHER_TENANT';
  END IF;

  IF v_binding.status = 'provisioning'
     AND v_binding.provisioning_token IS NOT NULL
     AND v_binding.provisioning_claimed_at IS NOT NULL
     AND v_binding.provisioning_claimed_at > v_now - interval '10 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_ALREADY_PROVISIONING';
  END IF;

  v_prior_last_error := CASE
    WHEN v_binding.status = 'provisioning'
     AND (
       v_binding.xai_phone_number_id IS NULL
       OR v_binding.xai_webhook_id IS NULL
       OR v_binding.webhook_secret_encrypted IS NULL
     )
      THEN 'XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS'
    ELSE v_binding.last_error
  END;

  UPDATE public.wireline_xai_phone_bindings
     SET status = 'provisioning',
         provisioning_token = p_claim_token,
         provisioning_claimed_at = v_now,
         last_error = 'XAI_PHONE_DEACTIVATING',
         updated_at = v_now
   WHERE id = v_binding.id
   RETURNING * INTO v_binding;

  RETURN QUERY
  SELECT
    v_binding.id,
    p_claim_token,
    v_binding.twilio_phone_number_sid,
    v_binding.twilio_sip_trunk_sid,
    v_prior_last_error;
END;
$$;

CREATE OR REPLACE FUNCTION public.wireline_retire_xai_phone_binding(
  p_user_id uuid,
  p_phone_number text,
  p_claim_token uuid,
  p_last_error text
)
RETURNS TABLE(binding_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_binding public.wireline_xai_phone_bindings%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_phone_number IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_INVALID_RETIREMENT';
  END IF;
  IF public.wireline_current_user_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'XAI_PHONE_TENANT_MISMATCH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('xai-phone:' || p_phone_number));
  SELECT * INTO v_binding
    FROM public.wireline_xai_phone_bindings
   WHERE phone_number = p_phone_number
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_binding.user_id IS DISTINCT FROM p_user_id OR v_binding.user_id = v_binding.id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_OWNERSHIP_MISMATCH';
  END IF;
  IF p_claim_token IS NOT NULL
     AND v_binding.provisioning_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_RETIREMENT_LEASE_REPLACED';
  END IF;
  IF p_claim_token IS NULL
     AND v_binding.status = 'provisioning'
     AND v_binding.provisioning_token IS NOT NULL
     AND v_binding.provisioning_claimed_at > v_now - interval '10 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_ALREADY_PROVISIONING';
  END IF;

  UPDATE public.wireline_xai_phone_bindings
     SET user_id = id,
         agent_id = 'retired:' || id::text,
         status = 'retired',
         provisioning_token = NULL,
         provisioning_claimed_at = NULL,
         last_error = CASE
           WHEN p_last_error IN (
             'XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS',
             'XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS'
           ) THEN p_last_error
           ELSE NULL
         END,
         updated_at = v_now
   WHERE id = v_binding.id
   RETURNING id INTO binding_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.wireline_scrub_xai_phone_bindings_for_purge(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_binding record;
  v_count integer := 0;
  v_affected integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_INVALID_PURGE_OWNER';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('account-deletion:' || p_user_id::text));
  IF NOT EXISTS (
    SELECT 1
      FROM public.wireline_deletion_queue AS queue
     WHERE queue.user_id = p_user_id
       AND queue.status = 'purging'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'XAI_PHONE_PURGE_NOT_TERMINAL';
  END IF;

  FOR v_binding IN
    SELECT id, phone_number
      FROM public.wireline_xai_phone_bindings
     WHERE user_id = p_user_id
     ORDER BY phone_number
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext('xai-phone:' || v_binding.phone_number));
    UPDATE public.wireline_xai_phone_bindings AS binding
       SET user_id = binding.id,
           agent_id = 'retired:' || binding.id::text,
           status = CASE WHEN binding.status = 'retired' THEN 'retired' ELSE 'error' END,
           provisioning_token = NULL,
           provisioning_claimed_at = NULL,
           last_error = CASE
             WHEN binding.last_error IN (
               'XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS',
               'XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS'
             ) THEN binding.last_error
             WHEN binding.status = 'retired' THEN NULL
             ELSE 'XAI_PHONE_OWNER_ERASED_REQUIRES_RECONCILIATION'
           END,
           updated_at = clock_timestamp()
     WHERE binding.id = v_binding.id
       AND binding.user_id = p_user_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_count := v_count + v_affected;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wireline_retire_xai_phone_binding(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.wireline_scrub_xai_phone_bindings_for_purge(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wireline_retire_xai_phone_binding(uuid, text, uuid, text)
  TO wireline_server;
GRANT EXECUTE ON FUNCTION public.wireline_scrub_xai_phone_bindings_for_purge(uuid)
  TO wireline_server;

RESET lock_timeout;
