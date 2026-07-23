import { z } from "zod";

/**
 * Shared HTTP request/response contracts.
 *
 * These schemas are the single source of truth for request validation on the
 * Express API. They are intentionally snake_case because the wire contract is
 * snake_case end-to-end (the React client speaks snake_case, and route handlers
 * convert to camelCase via `mapObjectToCamel` only AFTER validation).
 */

/** E.164 phone number, e.g. "+14155550123". */
export const e164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{1,14}$/, "Must be an E.164 phone number, e.g. +14155550123");

const twilioMessagingServiceSid = z
  .string()
  .trim()
  .regex(/^MG[a-fA-F0-9]{32}$/, "Must be a Twilio Messaging Service SID beginning with MG");

/**
 * POST /api/settings — tenant settings update.
 *
 * Explicit allowlist of client-writable columns (snake_case). Unknown keys are
 * stripped (Zod default) — never `.passthrough()`, which previously let
 * entitlement columns such as `live_video_addon_enabled` reach Drizzle `.set()`.
 * Server-owned billing/trial/activation/attribution fields are intentionally
 * absent; the route also re-filters to this allowlist after camelCase mapping.
 */
export const SettingsSchema = z.object({
  // Platform-admin-only billing capacity (stripped for non-admins in the route).
  subscription_status: z.string().max(40).nullable().optional(),
  max_agents: z.number().int().nullable().optional(),
  extra_agents: z.number().int().nonnegative().nullable().optional(),
  founder_unlimited_agents: z.boolean().nullable().optional(),

  vapi_phone_number_id: z.string().nullable().optional(),
  vapi_phone_inbound_agent_id: z.string().nullable().optional(),
  retention_days: z.number().int().positive().nullable().optional(),

  voice_llm_provider: z.string().max(60).nullable().optional(),
  voice_llm_model: z.string().max(120).nullable().optional(),

  daily_brief_enabled: z.boolean().nullable().optional(),
  daily_brief_send_at: z.string().max(20).nullable().optional(),
  daily_brief_recipient: z.string().nullable().optional(),

  business_name: z.string().max(200).nullable().optional(),
  business_type: z.string().max(120).nullable().optional(),
  primary_product: z.string().max(200).nullable().optional(),
  business_hours: z.unknown().nullable().optional(),
  crm_type: z.string().max(80).nullable().optional(),

  twilio_messaging_enabled: z.boolean().nullable().optional(),
  twilio_lookup_enabled: z.boolean().nullable().optional(),
  twilio_manager_alerts_enabled: z.boolean().nullable().optional(),
  twilio_messaging_service_sid: twilioMessagingServiceSid.nullable().optional(),
  twilio_sms_from_number: e164.nullable().optional(),
  twilio_whatsapp_from_number: e164.nullable().optional(),
  twilio_manager_alert_number: e164.nullable().optional(),

  handoff_phone: e164.nullable().optional(),

  prospecting_enabled: z.boolean().nullable().optional(),
  target_titles: z.unknown().nullable().optional(),
  target_industries: z.unknown().nullable().optional(),
  target_states: z.unknown().nullable().optional(),
  target_employee_ranges: z.unknown().nullable().optional(),

  brand_name: z.string().max(200).nullable().optional(),
  brand_logo_url: z.string().nullable().optional(),
  primary_color: z.string().max(40).nullable().optional(),

  autonomy_level: z.string().max(40).nullable().optional(),
  csat_sms_enabled: z.boolean().nullable().optional(),
});

export type SettingsInput = z.infer<typeof SettingsSchema>;

/**
 * POST /api/phone-numbers — attach an already-provisioned line to the tenant.
 * The handler reads `{ phone_number, vapi_number_id }` from the validated body.
 */
export const PhoneNumberCreateRequestSchema = z.object({
  phone_number: e164,
  vapi_number_id: z.string().min(1).max(200).optional().nullable(),
});

export type PhoneNumberCreateRequest = z.infer<typeof PhoneNumberCreateRequestSchema>;
