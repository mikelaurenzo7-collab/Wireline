-- 0163: fail closed when an operator promotes demo/test data into production.
--
-- Migration 0131 made account classification privileged and auditable, but it
-- allowed a demo or test tenant to become production while showcase fixtures,
-- synthetic entitlements, provider resources, or queued work were still
-- attached. The runtime correctly treats production as authorization for live
-- paid/provider actions, so that transition must itself be an evidence-backed
-- release boundary.
--
-- This migration is intentionally non-destructive. It reports blocker codes
-- and counts, never identifiers or contact data, and requires an operator to
-- resolve each blocker explicitly before retrying the promotion.

CREATE OR REPLACE FUNCTION public.wireline_account_environment_promotion_preflight(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH blocker_counts(code, blocker_count, remediation) AS (
    SELECT
      'ACCOUNT_NOT_FOUND',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.wireline_users AS users
          JOIN public.wireline_settings AS settings ON settings.user_id = users.id
          WHERE users.id = p_user_id
        ) THEN 0::bigint
        ELSE 1::bigint
      END,
      'Resolve the exact account UUID and its settings row before relying on this preflight.'

    UNION ALL

    SELECT
      'DEMO_ENTITLEMENT',
      (
        (
          SELECT count(*)
          FROM public.wireline_subscriptions AS subscriptions
          WHERE subscriptions.user_id = p_user_id
            AND (
              subscriptions.entitlement_source = 'demo'
              OR subscriptions.grant_reason = 'admin_demo_seed'
              OR (
                subscriptions.entitlement_source <> 'stripe'
                AND lower(coalesce(subscriptions.status, '')) IN ('active', 'trialing')
              )
            )
        )
        + (
          SELECT count(*)
          FROM public.wireline_settings AS settings
          WHERE settings.user_id = p_user_id
            AND (
              lower(coalesce(settings.subscription_status, '')) IN ('active', 'trialing')
              OR coalesce(settings.extra_agents, 0) > 0
              OR coalesce(settings.live_video_addon_enabled, false)
              OR coalesce(settings.trial_outbound_count, 0) > 0
            )
        )
      ),
      'Remove synthetic subscription, trial, extra-agent, and live-video entitlement through the audited billing/admin cleanup path; do not rewrite its provenance.'

    UNION ALL

    SELECT
      'DEMO_MARKED_ROWS',
      (
        (SELECT count(*) FROM public.wireline_call_logs WHERE user_id = p_user_id AND demo = true)
        + (SELECT count(*) FROM public.wireline_outbound_leads WHERE user_id = p_user_id AND demo = true)
        + (SELECT count(*) FROM public.wireline_appointments WHERE user_id = p_user_id AND demo = true)
        + (SELECT count(*) FROM public.wireline_dnc_list WHERE user_id = p_user_id AND demo = true)
      ),
      'Delete the tenant demo dataset with the scoped demo-data cleanup and verify every demo marker is gone.'

    UNION ALL

    SELECT
      'DEMO_SEED_IDENTIFIERS',
      (
        (SELECT count(*) FROM public.wireline_call_logs WHERE user_id = p_user_id AND vapi_call_id LIKE 'seed-call-%')
        + (SELECT count(*) FROM public.wireline_email_threads WHERE user_id = p_user_id AND thread_id LIKE 'seed-email-%')
        + (SELECT count(*) FROM public.wireline_email_messages WHERE user_id = p_user_id AND google_message_id LIKE 'seed-gmail-%')
        + (SELECT count(*) FROM public.wireline_sms_messages WHERE user_id = p_user_id AND twilio_sid LIKE 'seed-sms-%')
        + (
            SELECT count(*)
            FROM public.wireline_knowledge
            WHERE user_id = p_user_id
              AND content = ANY (ARRAY[
                'Our standard demo runs 25 minutes: 5 min discovery, 15 min live agent demo on their actual phone, 5 min Q&A + next-step.',
                'Scale customers get a dedicated CSM. CSM hands off after the first 90 days unless the customer asks to continue.',
                'Refund window: 14 days from invoice for any new charge. Beyond that we offer credits but not refunds.',
                'When troubleshooting webhook signature errors, rotate the signing secret from the integrations dashboard first, then re-verify delivery on the next event.',
                'Competitive wedge: we win on two-way SMS, email agents, and the supervisor cockpit. Lead with that triple when a prospect is comparing vendors.',
                'Enterprise legal redlines: we accept SCC, DPA, BAA on request. Security review pack available under NDA.'
              ]::text[])
          )
      ),
      'Remove every deterministic seed row, including legacy unmarked showcase rows, then rerun the preflight.'

    UNION ALL

    SELECT
      'RESERVED_DEMO_CONTACTS',
      (
        (
          SELECT count(*) FROM public.wireline_call_logs
          WHERE user_id = p_user_id
            AND regexp_replace(coalesce(customer_number, ''), '[^0-9]', '', 'g')
              ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
        )
        + (
          SELECT count(*) FROM public.wireline_outbound_leads
          WHERE user_id = p_user_id
            AND (
              regexp_replace(coalesce(customer_number, ''), '[^0-9]', '', 'g')
                ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
              OR regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g')
                ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
              OR (
                position('@' IN btrim(coalesce(email, ''))) > 1
                AND regexp_replace(
                  lower(regexp_replace(btrim(coalesce(email, '')), '^.*@', '')),
                  '\.+$',
                  ''
                ) ~ '(^|\.)example(\.(com|net|org))?$'
              )
            )
        )
        + (
          SELECT count(*) FROM public.wireline_appointments
          WHERE user_id = p_user_id
            AND regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g')
              ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
        )
        + (
          SELECT count(*) FROM public.wireline_dnc_list
          WHERE user_id = p_user_id
            AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
              ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
        )
        + (
          SELECT count(*) FROM public.wireline_email_threads
          WHERE user_id = p_user_id
            AND position('@' IN btrim(coalesce(customer_email, ''))) > 1
            AND regexp_replace(
              lower(regexp_replace(btrim(coalesce(customer_email, '')), '^.*@', '')),
              '\.+$',
              ''
            ) ~ '(^|\.)example(\.(com|net|org))?$'
        )
        + (
          SELECT count(*) FROM public.wireline_sms_threads
          WHERE user_id = p_user_id
            AND regexp_replace(coalesce(customer_number, ''), '[^0-9]', '', 'g')
              ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
        )
        + (
          SELECT count(*) FROM public.wireline_lead_dossiers
          WHERE user_id = p_user_id
            AND (
              regexp_replace(coalesce(customer_number, ''), '[^0-9]', '', 'g')
                ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
              OR (
                position('@' IN btrim(coalesce(customer_email, ''))) > 1
                AND regexp_replace(
                  lower(regexp_replace(btrim(coalesce(customer_email, '')), '^.*@', '')),
                  '\.+$',
                  ''
                ) ~ '(^|\.)example(\.(com|net|org))?$'
              )
            )
        )
        + (
          SELECT count(*) FROM public.wireline_consent_log
          WHERE user_id = p_user_id
            AND regexp_replace(coalesce(customer_number, ''), '[^0-9]', '', 'g')
              ~ '^(1?[2-9][0-9]{2}55501[0-9]{2}|1555010[0-9]{4})$'
        )
      ),
      'Remove reserved NANP 555-0100 through 555-0199, legacy malformed demo numbers, and RFC example-domain fixture contacts from tenant data.'

    UNION ALL

    SELECT
      'BILLING_PROVIDER_BINDING',
      (
        (
          SELECT count(*)
          FROM public.wireline_subscriptions
          WHERE user_id = p_user_id
            AND (
              stripe_customer_id IS NOT NULL
              OR stripe_subscription_id IS NOT NULL
              OR stripe_price_id IS NOT NULL
            )
        )
        + (
          SELECT count(*)
          FROM public.wireline_credit_ledger
          WHERE user_id = p_user_id
        )
      ),
      'Reconcile and detach test/demo billing objects and credit ledger state before promotion; create live billing state only after the account is production.'

    UNION ALL

    SELECT
      'VOICE_OR_CARRIER_PROVIDER_RESOURCE',
      (
        (
          SELECT count(*)
          FROM public.wireline_settings
          WHERE user_id = p_user_id
            AND (
              vapi_private_key IS NOT NULL
              OR vapi_phone_number_id IS NOT NULL
              OR vapi_phone_inbound_agent_id IS NOT NULL
              OR twilio_messaging_service_sid IS NOT NULL
              OR twilio_sms_from_number IS NOT NULL
              OR twilio_whatsapp_from_number IS NOT NULL
              OR twilio_manager_alert_number IS NOT NULL
            )
        )
        + (SELECT count(*) FROM public.wireline_phone_numbers WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_call_queues WHERE user_id = p_user_id AND vapi_number_id IS NOT NULL)
        + (SELECT count(*) FROM public.wireline_xai_phone_bindings WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_orphan_carrier_resources WHERE former_user_id = p_user_id AND status = 'pending')
        + (
          SELECT count(*)
          FROM public.wireline_cloned_voices
          WHERE user_id = p_user_id
            AND (voice_id IS NOT NULL OR preview_url IS NOT NULL)
        )
        + (
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
        )
      ),
      'Release or explicitly reconcile every demo/test voice, number, carrier, and presenter resource before promotion.'

    UNION ALL

    SELECT
      'EXTERNAL_CONNECTION',
      (
        (SELECT count(*) FROM public.wireline_email_accounts WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_calendar_accounts WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_crm_connections WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_design_integrations WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_mobile_devices WHERE user_id = p_user_id)
        + (SELECT count(*) FROM public.wireline_webhooks WHERE user_id = p_user_id AND active = true)
        + (SELECT count(*) FROM public.wireline_intake_keys WHERE user_id = p_user_id AND active = true)
      ),
      'Disconnect demo/test OAuth, push, webhook, and intake-key connections; reconnect them after production promotion.'

    UNION ALL

    SELECT
      'LIVE_AUTOMATION_ENABLED',
      (
        (
          SELECT count(*)
          FROM public.wireline_settings
          WHERE user_id = p_user_id
            AND (
              coalesce(daily_brief_enabled, false)
              OR coalesce(prospecting_enabled, false)
              OR coalesce(twilio_messaging_enabled, false)
              OR coalesce(twilio_manager_alerts_enabled, false)
            )
        )
        + (SELECT count(*) FROM public.wireline_cadences WHERE user_id = p_user_id AND active = true)
        + (
          SELECT count(*)
          FROM public.wireline_outbound_campaigns
          WHERE user_id = p_user_id
            AND lower(coalesce(status, 'draft')) NOT IN ('draft', 'completed', 'cancelled', 'stopped', 'archived')
        )
      ),
      'Disable live delivery, prospecting, cadence, and campaign automation before changing the account environment.'

    UNION ALL

    SELECT
      'PENDING_RISKY_STATE',
      (
        (SELECT count(*) FROM public.wireline_account_operation_leases WHERE user_id = p_user_id AND expires_at > now())
        + (SELECT count(*) FROM public.wireline_jobs WHERE user_id = p_user_id AND lower(coalesce(status, 'pending')) IN ('pending', 'running', 'processing', 'retrying'))
        + (SELECT count(*) FROM public.wireline_webhook_deliveries WHERE user_id = p_user_id AND lower(coalesce(status, 'pending')) IN ('pending', 'running', 'processing', 'retrying'))
        + (SELECT count(*) FROM public.wireline_cadence_runs WHERE user_id = p_user_id AND lower(coalesce(status, 'active')) = 'active')
        + (SELECT count(*) FROM public.wireline_follow_up_tasks WHERE user_id = p_user_id AND lower(coalesce(status, 'pending')) IN ('pending', 'open', 'in_progress', 'approved', 'queued'))
        + (SELECT count(*) FROM public.wireline_signal_presence WHERE user_id = p_user_id)
        + (
          SELECT count(*)
          FROM public.wireline_outbound_leads
          WHERE user_id = p_user_id
            AND lower(coalesce(status, 'pending')) IN (
              'pending', 'queued', 'dialing', 'connected', 'retrying',
              'callback-scheduled', 'voicemail-left'
            )
        )
      ),
      'Let in-flight leases and deliveries settle, then cancel or finish queued jobs, calls, cadences, follow-ups, and outbound work.'

    UNION ALL

    SELECT
      'ACCOUNT_DELETION_PENDING',
      (
        SELECT count(*)
        FROM public.wireline_deletion_queue
        WHERE user_id = p_user_id
          AND cancelled_at IS NULL
          AND purged_at IS NULL
          AND lower(coalesce(status, 'pending')) NOT IN ('cancelled', 'purged', 'completed')
      ),
      'Cancel the account-deletion request through the supported recovery path before promotion.'
  ),
  active_blockers AS (
    SELECT code, blocker_count, remediation
    FROM blocker_counts
    WHERE blocker_count > 0
  ),
  report AS (
    SELECT
      count(*)::integer AS blocker_categories,
      coalesce(sum(blocker_count), 0)::bigint AS blocker_rows,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'code', code,
            'count', blocker_count,
            'remediation', remediation
          )
          ORDER BY code
        ),
        '[]'::jsonb
      ) AS blockers
    FROM active_blockers
  )
  SELECT jsonb_build_object(
    'version', 1,
    'ready', report.blocker_categories = 0,
    'blocker_categories', report.blocker_categories,
    'blocker_rows', report.blocker_rows,
    'blockers', report.blockers
  )
  FROM report;
$$;

COMMENT ON FUNCTION public.wireline_account_environment_promotion_preflight(uuid) IS
  'Read-only, count-only safety preflight for demo/test-to-production account promotion. Returns no provider identifiers or contact data.';

REVOKE ALL ON FUNCTION public.wireline_account_environment_promotion_preflight(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wireline_account_environment_promotion_preflight(uuid)
  TO service_role;

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
  v_promotion_preflight jsonb;
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

  -- Resolve the stable user UUID first, then take the same transaction-scoped
  -- advisory lock used by deletion and provider/billing admission. Taking the
  -- advisory lock before the settings row lock avoids reversing the global
  -- lock order used by those paths.
  BEGIN
    SELECT users.id
    INTO STRICT v_user_id
    FROM public.wireline_users AS users
    WHERE lower(trim(users.email)) = v_target_email;
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

  PERFORM pg_advisory_xact_lock(hashtext('account-deletion:' || v_user_id::text));

  BEGIN
    SELECT users.email, settings.account_environment
    INTO STRICT v_account_email, v_previous_environment
    FROM public.wireline_users AS users
    JOIN public.wireline_settings AS settings
      ON settings.user_id = users.id
    WHERE users.id = v_user_id
      AND lower(trim(users.email)) = v_target_email
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

  IF v_environment = 'production' AND v_previous_environment <> 'production' THEN
    IF current_setting('transaction_isolation') <> 'serializable' THEN
      RAISE EXCEPTION USING
        ERRCODE = '25001',
        MESSAGE = 'Production promotion requires a SERIALIZABLE transaction.',
        HINT = 'Use scripts/set-account-environment.ts so concurrent fixture or provider state cannot race the preflight.';
    END IF;

    SELECT public.wireline_account_environment_promotion_preflight(v_user_id)
    INTO v_promotion_preflight;

    IF coalesce((v_promotion_preflight ->> 'ready')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Production promotion refused: account cleanup/preflight found blockers.',
        DETAIL = v_promotion_preflight::text,
        HINT = 'Resolve every reported blocker with its supported cleanup or reconciliation path, then retry the audited promotion.';
    END IF;
  END IF;

  UPDATE public.wireline_settings
  SET account_environment = v_environment,
      updated_at = now()
  WHERE wireline_settings.user_id = v_user_id;

  -- Demoting or correcting an account to test/demo may conservatively remove
  -- historical product events from production evidence. Promotion must never
  -- do the inverse: past demo/test activity remains labelled as such, and only
  -- events created after the production transition carry production truth.
  IF NOT (v_environment = 'production' AND v_previous_environment <> 'production') THEN
    UPDATE public.wireline_audit_log
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'account_environment', v_environment,
      'demo_account', v_environment <> 'production'
    )
    WHERE wireline_audit_log.user_id = v_user_id
      AND wireline_audit_log.event_type = 'product.event';

    GET DIAGNOSTICS v_product_events_updated = ROW_COUNT;
  END IF;

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
      'production_promotion', v_environment = 'production' AND v_previous_environment <> 'production',
      'promotion_preflight', v_promotion_preflight,
      'historical_product_events_preserved',
        v_environment = 'production' AND v_previous_environment <> 'production',
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
  'Privileged audited production/test/demo account classification. Demo/test promotion fails closed until a count-only cleanup preflight proves no synthetic entitlement, fixture, provider, connection, or pending-risk blocker remains.';

REVOKE ALL ON FUNCTION public.wireline_set_account_environment(text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wireline_set_account_environment(text, text, text, text)
  TO service_role;
