export const PRODUCT_EVENT_VERSION = "2026-07-05";

export const PRODUCT_EVENT_NAMES = [
  "landing_viewed",
  "landing_audience_selected",
  "landing_primary_cta_clicked",
  "landing_demo_clicked",
  "signup_intent_captured",
  "signup_started",
  "signup_completed",
  "agent_draft_created",
  "agent_created",
  "agent_template_selected",
  "training_asset_added",
  "training_rule_added",
  "post_create_wizard_step_completed",
  "test_call_started",
  "test_call_completed",
  "agent_correction_applied",
  "wire_started",
  "phone_number_provision_started",
  "phone_number_provision_completed",
  "agent_launch_completed",
  "outbound_call_started",
  "first_call_completed",
  "live_call_completed",
  "upgrade_to_paid",
  "follow_up_sent",
  "conversation_balance_checkout_started",
  "conversation_balance_top_up_completed",
  "subscription_checkout_started",
  "subscription_started",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const ACTIVATION_EVENT_NAMES = [
  "landing_viewed",
  "landing_primary_cta_clicked",
  "signup_intent_captured",
  "signup_started",
  "signup_completed",
  "agent_draft_created",
  "agent_created",
  "training_asset_added",
  "post_create_wizard_step_completed",
  "test_call_completed",
  "wire_started",
  "agent_launch_completed",
  "first_call_completed",
  "live_call_completed",
  "upgrade_to_paid",
] as const satisfies readonly ProductEventName[];

export const PRODUCT_EVENT_AUDIENCES = [
  "personal",
  "solo_business",
  "team_smb",
  "sales",
  "call_center",
  "enterprise",
] as const;

export type ProductEventAudience = (typeof PRODUCT_EVENT_AUDIENCES)[number];

export const PRODUCT_EVENT_SURFACES = [
  "marketing_web",
  "web_workspace",
  "browser_extension",
  "ios",
  "android",
  "chatgpt_app",
  "claude_app",
  "api",
] as const;

export type ProductEventSurface = (typeof PRODUCT_EVENT_SURFACES)[number];

export type ProductEventPayload = {
  event: ProductEventName;
  audience?: ProductEventAudience;
  surface: ProductEventSurface;
  planId?: "personal" | "team" | "business" | "enterprise";
  wedge?: string;
  templateId?: string;
  agentId?: string;
  accountId?: string;
  correlationId?: string;
  occurredAt: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const PRODUCT_EVENT_NAME_SET = new Set<string>(PRODUCT_EVENT_NAMES);
const PRODUCT_EVENT_AUDIENCE_SET = new Set<string>(PRODUCT_EVENT_AUDIENCES);
const PRODUCT_EVENT_SURFACE_SET = new Set<string>(PRODUCT_EVENT_SURFACES);

export function isProductEventName(value: string | null | undefined): value is ProductEventName {
  return !!value && PRODUCT_EVENT_NAME_SET.has(value);
}

export function isProductEventAudience(
  value: string | null | undefined,
): value is ProductEventAudience {
  return !!value && PRODUCT_EVENT_AUDIENCE_SET.has(value);
}

export function isProductEventSurface(
  value: string | null | undefined,
): value is ProductEventSurface {
  return !!value && PRODUCT_EVENT_SURFACE_SET.has(value);
}

export function makeProductEvent(
  input: Omit<ProductEventPayload, "occurredAt"> & { occurredAt?: string },
): ProductEventPayload {
  return {
    ...input,
    occurredAt: input.occurredAt || new Date().toISOString(),
  };
}
