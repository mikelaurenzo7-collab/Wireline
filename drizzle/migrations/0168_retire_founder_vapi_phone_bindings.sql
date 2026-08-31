-- Retire legacy founder Vapi phone bindings after BotBound moved customer voice to OpenAI + Twilio.
-- This migration is deliberately scoped to the founder login and is idempotent.

DO $$
DECLARE
  founder_id uuid;
BEGIN
  SELECT id
    INTO founder_id
  FROM public.wireline_users
  WHERE lower(email) = lower('mikelaurenzo7@gmail.com')
  LIMIT 1;

  IF founder_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.wireline_phone_numbers
  WHERE user_id = founder_id
    AND nullif(btrim(vapi_number_id), '') IS NOT NULL;

  UPDATE public.wireline_settings
  SET
    vapi_private_key = NULL,
    vapi_phone_number_id = NULL,
    vapi_phone_inbound_agent_id = NULL,
    twilio_sms_from_number = NULL,
    twilio_messaging_service_sid = NULL,
    twilio_messaging_enabled = false,
    brand_name = 'BotBound',
    business_name = 'BotBound',
    business_type = 'AI agent software',
    brand_logo_url = 'https://botbound.me/botbound-icon.svg',
    workspace_display_name = 'BotBound',
    workspace_logo_url = 'https://botbound.me/botbound-icon.svg',
    workspace_contact_line = 'support@botbound.me',
    workspace_wireline_credit_visible = false,
    updated_at = now()
  WHERE user_id = founder_id;
END $$;
