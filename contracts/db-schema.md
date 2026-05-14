# Database Schema Contract

## Table: `wireline_settings`
- `id`: TEXT (Primary Key)
- `user_id`: UUID (FK to auth.users)
- `subscription_status`: TEXT ('active', 'past_due')
- `max_agents`: INTEGER
- `vapi_private_key`: TEXT
- `vapi_phone_number_id`: TEXT
- `retention_days`: INTEGER
- `updated_at`: TIMESTAMPTZ

## Table: `wireline_agents`
- `id`: TEXT (Primary Key)
- `user_id`: UUID
- `name`: TEXT
- `voice_id`: TEXT
- `voice_id_inbound`: TEXT
- `voice_id_outbound`: TEXT
- `voice_provider`: TEXT
- `first_message`: TEXT
- `archetype`: TEXT
- `ambient_noise`: TEXT
- `channel`: TEXT ('voice', 'email', 'omnichannel')
- `created_at`: TIMESTAMPTZ

## Table: `wireline_phone_numbers`
- `id`: BIGINT (Primary Key)
- `user_id`: UUID
- `phone_number`: TEXT
- `vapi_number_id`: TEXT
- `agent_id`: TEXT (FK to wireline_agents)

## Table: `wireline_call_logs`
- `id`: BIGINT (Primary Key)
- `user_id`: UUID
- `vapi_call_id`: TEXT
- `agent_id`: TEXT
- `direction`: TEXT
- `customer_number`: TEXT
- `duration_seconds`: INTEGER
- `cost`: DECIMAL
- `summary`: TEXT
- `transcript`: TEXT
- `lead_score`: INTEGER
- `intent_label`: TEXT
- `created_at`: TIMESTAMPTZ
