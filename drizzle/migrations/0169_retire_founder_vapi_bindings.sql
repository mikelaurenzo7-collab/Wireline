-- Retire the founder-only Vapi showcase fleet without changing customer phone provisioning.
--
-- This migration is intentionally idempotent because the production cleanup was
-- performed out of band before the matching application release. Customer-owned
-- Twilio numbers and OpenAI Realtime routing are not selected by this migration.

with founder as (
  select id
  from public.wireline_users
  where lower(email) = lower('mikelaurenzo7@gmail.com')
)
delete from public.wireline_phone_numbers as phone
using founder
where phone.user_id = founder.id
  and nullif(btrim(phone.vapi_number_id), '') is not null;

with founder as (
  select id
  from public.wireline_users
  where lower(email) = lower('mikelaurenzo7@gmail.com')
)
update public.wireline_settings as settings
set
  vapi_private_key = null,
  vapi_phone_number_id = null,
  vapi_phone_inbound_agent_id = null,
  twilio_sms_from_number = null,
  twilio_messaging_service_sid = null,
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
from founder
where settings.user_id = founder.id;

with founder as (
  select id
  from public.wireline_users
  where lower(email) = lower('mikelaurenzo7@gmail.com')
)
update public.wireline_agents as agent
set
  business_variables =
    (coalesce(agent.business_variables, '{}'::jsonb) - 'public_phone_number')
    || jsonb_build_object('founder_pstn_status', 'retired'),
  updated_at = now()
from founder
where agent.user_id = founder.id
  and coalesce(agent.business_variables, '{}'::jsonb) ->> 'founder_showcase' = 'true';
