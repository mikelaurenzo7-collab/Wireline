-- 0153: Preserve and safely reclaim xAI Direct SIP registration credentials.
--
-- xAI returns dispatch_signing_secret only at registration time and currently
-- documents no deletion endpoint for phone registrations. Cascading ownership
-- foreign keys could therefore erase the only verification secret while the
-- provider registration remained live. The columns remain NOT NULL ownership
-- pointers and RLS remains unchanged, but provider cleanup/reuse is no longer
-- coupled to tenant-row lifetime.

ALTER TABLE public.wireline_xai_phone_bindings
  DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_user_id_fkey;

ALTER TABLE public.wireline_xai_phone_bindings
  DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_agent_id_fkey;

COMMENT ON TABLE public.wireline_xai_phone_bindings IS
  'Platform-retained Twilio/xAI Direct SIP registration ledger with encrypted one-time webhook verification secrets and current tenant ownership pointers.';

-- RLS must not expose retired provider credentials to another tenant. This
-- SECURITY DEFINER claim boundary performs the only permitted cross-owner
-- transition after proving the requesting tenant currently owns and assigns the
-- exact Wireline phone line. The advisory lock and row lock make claim/reuse
-- serializable across serverless workers.
CREATE OR REPLACE FUNCTION public.wireline_claim_xai_phone_binding(
  p_user_id uuid,
  p_agent_id text,
  p_phone_number text,
  p_claim_token uuid
)
RETURNS TABLE(binding_id uuid, claim_token uuid, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_binding public.wireline_xai_phone_bindings%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_agent_id IS NULL OR p_phone_number IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_INVALID_CLAIM';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.wireline_phone_numbers AS phone
     WHERE phone.user_id = p_user_id
       AND phone.agent_id = p_agent_id
       AND phone.phone_number = p_phone_number
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_OWNERSHIP_MISMATCH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('xai-phone:' || p_phone_number));

  SELECT *
    INTO v_binding
    FROM public.wireline_xai_phone_bindings
   WHERE phone_number = p_phone_number
   FOR UPDATE;

  IF FOUND THEN
    IF v_binding.user_id = p_user_id
       AND v_binding.agent_id = p_agent_id
       AND v_binding.status = 'active'
       AND v_binding.twilio_phone_number_sid IS NOT NULL
       AND v_binding.twilio_sip_trunk_sid IS NOT NULL
       AND v_binding.xai_phone_number_id IS NOT NULL
       AND v_binding.xai_webhook_id IS NOT NULL
       AND v_binding.webhook_secret_encrypted IS NOT NULL THEN
      RETURN QUERY SELECT v_binding.id, NULL::uuid, true;
      RETURN;
    END IF;

    IF v_binding.last_error = 'XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_OUTCOME_AMBIGUOUS';
    END IF;

    IF v_binding.user_id <> p_user_id AND v_binding.status <> 'retired' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_OWNED_BY_ANOTHER_TENANT';
    END IF;

    IF v_binding.status = 'provisioning'
       AND v_binding.provisioning_token IS NOT NULL
       AND v_binding.provisioning_claimed_at IS NOT NULL
       AND v_binding.provisioning_claimed_at > v_now - interval '10 minutes' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'XAI_PHONE_ALREADY_PROVISIONING';
    END IF;

    UPDATE public.wireline_xai_phone_bindings
       SET user_id = p_user_id,
           agent_id = p_agent_id,
           status = 'provisioning',
           provisioning_token = p_claim_token,
           provisioning_claimed_at = v_now,
           last_error = NULL,
           updated_at = v_now
     WHERE id = v_binding.id
     RETURNING * INTO v_binding;
  ELSE
    INSERT INTO public.wireline_xai_phone_bindings (
      user_id,
      agent_id,
      phone_number,
      status,
      provisioning_token,
      provisioning_claimed_at,
      created_at,
      updated_at
    )
    VALUES (
      p_user_id,
      p_agent_id,
      p_phone_number,
      'provisioning',
      p_claim_token,
      v_now,
      v_now,
      v_now
    )
    RETURNING * INTO v_binding;
  END IF;

  RETURN QUERY SELECT v_binding.id, p_claim_token, false;
END;
$$;

REVOKE ALL ON FUNCTION public.wireline_claim_xai_phone_binding(uuid, text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wireline_claim_xai_phone_binding(uuid, text, text, uuid)
  TO wireline_server;
