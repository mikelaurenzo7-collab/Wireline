-- 0131: provide an explicit, audited operator boundary for account classification.
--
-- New accounts intentionally default to production. Internal test or showcase
-- accounts created after launch must therefore be reclassified before their
-- activity is used for launch decisions. Keep that mutation out of customer
-- routes and browsers: only the database owner or Supabase service_role may
-- invoke this function, and every invocation is recorded durably.

CREATE OR REPLACE FUNCTION public.wireline_set_account_environment(
  p_account_email text,
  p_environment text,
  p_reason text,
  p_actor_email text
)
RETURNS TABLE (
  user_id uuid,
  account_email text,
  previous_environment text,
  account_environment text,
  product_events_updated integer,
  audit_log_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_email text := lower(trim(COALESCE(p_account_email, '')));
  v_environment text := lower(trim(COALESCE(p_environment, '')));
  v_reason text := trim(COALESCE(p_reason, ''));
  v_actor_email text := lower(trim(COALESCE(p_actor_email, '')));
  v_user_id uuid;
  v_account_email text;
  v_previous_environment text;
  v_product_events_updated integer := 0;
  v_audit_log_id bigint;
BEGIN
  IF v_target_email = '' OR position('@' IN v_target_email) <= 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A valid target account email is required.';
  END IF;

  IF v_environment NOT IN ('production', 'test', 'demo') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Environment must be production, test, or demo.';
  END IF;

  IF char_length(v_reason) < 8 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A concrete reason of at least 8 characters is required.';
  END IF;

  IF v_actor_email = '' OR position('@' IN v_actor_email) <= 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A valid operator actor email is required.';
  END IF;

  BEGIN
    SELECT users.id, users.email, settings.account_environment
    INTO STRICT v_user_id, v_account_email, v_previous_environment
    FROM public.wireline_users AS users
    JOIN public.wireline_settings AS settings
      ON settings.user_id = users.id
    WHERE lower(trim(users.email)) = v_target_email
    FOR UPDATE OF settings;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = format('No Wireline account exists for %s.', v_target_email);
    WHEN TOO_MANY_ROWS THEN
      RAISE EXCEPTION USING
        ERRCODE = '21000',
        MESSAGE = format('Multiple Wireline accounts matched %s.', v_target_email);
  END;

  UPDATE public.wireline_settings
  SET account_environment = v_environment,
      updated_at = now()
  WHERE wireline_settings.user_id = v_user_id;

  UPDATE public.wireline_audit_log
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'account_environment', v_environment,
    'demo_account', v_environment <> 'production'
  )
  WHERE wireline_audit_log.user_id = v_user_id
    AND wireline_audit_log.event_type = 'product.event';

  GET DIAGNOSTICS v_product_events_updated = ROW_COUNT;

  INSERT INTO public.wireline_audit_log (
    user_id,
    action,
    event_type,
    severity,
    actor_email,
    resource_type,
    resource_id,
    metadata
  )
  VALUES (
    v_user_id,
    CASE
      WHEN v_previous_environment = v_environment THEN 'account_environment_verified'
      ELSE 'account_environment_changed'
    END,
    'operator.account_environment',
    'info',
    v_actor_email,
    'wireline_settings',
    v_user_id::text,
    jsonb_build_object(
      'previous_environment', v_previous_environment,
      'account_environment', v_environment,
      'reason', v_reason,
      'product_events_updated', v_product_events_updated,
      'no_op', v_previous_environment = v_environment,
      'database_session_user', session_user,
      'database_current_user', current_user
    )
  )
  RETURNING id INTO v_audit_log_id;

  RETURN QUERY
  SELECT
    v_user_id,
    v_account_email,
    v_previous_environment,
    v_environment,
    v_product_events_updated,
    v_audit_log_id;
END;
$$;

COMMENT ON FUNCTION public.wireline_set_account_environment(text, text, text, text) IS
  'Privileged operator mutation for production/test/demo account classification with historical product-event repair and durable audit evidence.';

REVOKE ALL ON FUNCTION public.wireline_set_account_environment(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wireline_set_account_environment(text, text, text, text)
  TO service_role;
