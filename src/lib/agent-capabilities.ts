export const AGENT_TOOL_NAME_VALUES = [
  "view_recent_interactions",
  "escalate_to_human",
  "create_fleet_task",
  "send_email",
  "send_text_message",
  "lookup_phone_number",
  "add_to_dnc",
  "check_calendar_availability",
  "book_appointment",
  "search_leads",
  "update_lead_status",
  "log_payment_promise",
  "create_support_ticket",
  "leave_voicemail",
  "schedule_callback",
  "capture_customer_profile",
  "send_slack_notification",
  "generate_zoom_link",
  "crm_search_contacts",
  "crm_log_call",
  "crm_create_opportunity",
  "send_contract",
  "enrich_lead",
  "gemini_ground",
  "shopify_lookup_order",
  "shopify_check_inventory",
  "shopify_lookup_customer",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAME_VALUES)[number];

export type ToolIntegration =
  | "twilio"
  | "calendar"
  | "crm"
  | "slack"
  | "zoom"
  | "docusign"
  | "apollo"
  | "meta"
  | "gemini"
  | "shopify";

export interface AgentToolCatalogEntry {
  name: AgentToolName;
  label: string;
  description: string;
  group: "core" | "calendar" | "crm" | "messaging" | "team" | "meetings" | "ecommerce";
  integration?: ToolIntegration;
}

export const AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[] = [
  // Core
  {
    name: "view_recent_interactions",
    label: "View recent interactions",
    description: "Loads recent calls and open context for continuity.",
    group: "core",
  },
  {
    name: "escalate_to_human",
    label: "Escalate to human",
    description: "Transfers the conversation to a human when risk or complexity is too high.",
    group: "core",
  },
  {
    name: "create_fleet_task",
    label: "Create fleet task",
    description: "Queues a follow-up task for a human teammate.",
    group: "core",
  },
  {
    name: "send_email",
    label: "Send email",
    description: "Emails confirmations, quotes, summaries, or follow-ups.",
    group: "core",
  },
  {
    name: "search_leads",
    label: "Search leads",
    description: "Searches the internal lead database for contact context.",
    group: "core",
  },
  {
    name: "update_lead_status",
    label: "Update lead status",
    description: "Writes the outcome of the conversation back to CRM.",
    group: "core",
  },
  {
    name: "log_payment_promise",
    label: "Log payment promise",
    description: "Records a payment commitment for collections compliance.",
    group: "core",
  },
  {
    name: "create_support_ticket",
    label: "Create support ticket",
    description: "Creates a formal support escalation for engineering or specialists.",
    group: "core",
  },
  {
    name: "leave_voicemail",
    label: "Leave voicemail",
    description: "Marks voicemail detection and stores the exact voicemail copy used.",
    group: "core",
  },
  {
    name: "schedule_callback",
    label: "Schedule callback",
    description: "Schedules an automatic callback at the promised time.",
    group: "core",
  },
  {
    name: "capture_customer_profile",
    label: "Capture customer profile",
    description: "Stores structured discovery notes for future interactions.",
    group: "core",
  },
  {
    name: "add_to_dnc",
    label: "Add to DNC",
    description: "Adds a number to the tenant Do Not Call list immediately.",
    group: "core",
  },
  // Calendar
  {
    name: "check_calendar_availability",
    label: "Check calendar availability",
    description: "Reads connected calendars before proposing a time.",
    group: "calendar",
    integration: "calendar",
  },
  {
    name: "book_appointment",
    label: "Book appointment",
    description: "Creates a calendar event once the slot is confirmed.",
    group: "calendar",
    integration: "calendar",
  },
  // CRM
  {
    name: "crm_search_contacts",
    label: "Search CRM contacts",
    description: "Queries connected Salesforce or HubSpot for matching contacts.",
    group: "crm",
    integration: "crm",
  },
  {
    name: "crm_log_call",
    label: "Log call to CRM",
    description: "Records the call outcome in Salesforce or HubSpot.",
    group: "crm",
    integration: "crm",
  },
  {
    name: "crm_create_opportunity",
    label: "Create deal/opportunity",
    description: "Pushes a qualified lead into the CRM pipeline.",
    group: "crm",
    integration: "crm",
  },
  // Messaging
  {
    name: "send_text_message",
    label: "Send SMS / WhatsApp",
    description: "Sends a text follow-up when the customer consented to messaging.",
    group: "messaging",
    integration: "twilio",
  },
  {
    name: "lookup_phone_number",
    label: "Phone intelligence lookup",
    description: "Validates a phone number and returns line-type / carrier detail.",
    group: "messaging",
    integration: "twilio",
  },
  // Team
  {
    name: "send_slack_notification",
    label: "Notify team via Slack",
    description:
      "Posts a message to the configured Slack channel when something important happens.",
    group: "team",
    integration: "slack",
  },
  // Meetings
  {
    name: "generate_zoom_link",
    label: "Generate Zoom link",
    description: "Creates a Zoom meeting and attaches the join URL to calendar events.",
    group: "meetings",
    integration: "zoom",
  },
  // Action Engine
  {
    name: "send_contract",
    label: "Send contract via DocuSign",
    description: "Dispatches a DocuSign template to the caller's email immediately.",
    group: "core",
    integration: "docusign",
  },
  {
    name: "enrich_lead",
    label: "Enrich lead",
    description: "Pulls LinkedIn/Apollo profile data for a phone number.",
    group: "core",
    integration: "apollo",
  },
  {
    name: "gemini_ground",
    label: "Grounded web search (Gemini)",
    description:
      "Looks up fresh public info via Gemini's grounded search — pricing pages, news, hours, regulations — when the answer isn't in the agent's knowledge base.",
    group: "core",
    integration: "gemini",
  },
  // E-commerce — Shopify
  {
    name: "shopify_lookup_order",
    label: "Look up Shopify order",
    description: "Finds an order's status, tracking, and items by order number or customer email.",
    group: "ecommerce",
    integration: "shopify",
  },
  {
    name: "shopify_check_inventory",
    label: "Check Shopify inventory",
    description:
      "Searches the store catalog for products and returns live stock levels and prices.",
    group: "ecommerce",
    integration: "shopify",
  },
  {
    name: "shopify_lookup_customer",
    label: "Look up Shopify customer",
    description: "Finds a customer by email or phone with their recent order history.",
    group: "ecommerce",
    integration: "shopify",
  },
  {
    name: "shopify_start_return",
    label: "Start Shopify return",
    description:
      "Opens a return request for an order. Does not issue a refund — that stays merchant-approved.",
    group: "ecommerce",
    integration: "shopify",
  },
  {
    name: "shopify_cancel_order",
    label: "Cancel Shopify order",
    description: "Cancels an unshipped order at the customer's request.",
    group: "ecommerce",
    integration: "shopify",
  },
  {
    name: "shopify_update_address",
    label: "Update Shopify shipping address",
    description: "Corrects the shipping address on an order before it ships.",
    group: "ecommerce",
    integration: "shopify",
  },
] as const;

/** Tool names that require a connected Shopify store. */
export const SHOPIFY_TOOL_NAMES: readonly AgentToolName[] = [
  "shopify_lookup_order",
  "shopify_check_inventory",
  "shopify_lookup_customer",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
];

export const ROLE_TOOL_SETS: Record<string, readonly AgentToolName[]> = {
  sales: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "update_lead_status",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "check_calendar_availability",
    "book_appointment",
    "crm_search_contacts",
    "crm_log_call",
    "crm_create_opportunity",
    "send_slack_notification",
    "generate_zoom_link",
    "send_contract",
    "enrich_lead",
    "gemini_ground",
  ],
  customer_service: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "update_lead_status",
    "check_calendar_availability",
    "book_appointment",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "crm_search_contacts",
    "crm_log_call",
    "send_slack_notification",
    "gemini_ground",
    "shopify_lookup_order",
    "shopify_check_inventory",
    "shopify_lookup_customer",
    "shopify_start_return",
    "shopify_cancel_order",
    "shopify_update_address",
  ],
  // E-commerce support agents — handle online-store customer calls and
  // emails: order status, inventory, returns, address fixes. Shopify
  // tools are the core of this role.
  ecommerce: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "create_support_ticket",
    "send_slack_notification",
    "gemini_ground",
    "shopify_lookup_order",
    "shopify_check_inventory",
    "shopify_lookup_customer",
    "shopify_start_return",
    "shopify_cancel_order",
    "shopify_update_address",
  ],
  scheduler: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "check_calendar_availability",
    "book_appointment",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "send_slack_notification",
    "generate_zoom_link",
    "crm_search_contacts",
  ],
  collections: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "log_payment_promise",
    "update_lead_status",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
  ],
  technical_support: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "update_lead_status",
    "create_support_ticket",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
  ],
  lead_qualifier: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "update_lead_status",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
  ],
  receptionist: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "check_calendar_availability",
    "book_appointment",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "send_slack_notification",
    "generate_zoom_link",
    "crm_search_contacts",
    "gemini_ground",
  ],
  marketing: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_fleet_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "search_leads",
    "update_lead_status",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
  ],
};

const AGENT_TOOL_SET = new Set<string>(AGENT_TOOL_NAME_VALUES);

export function isAgentToolName(value: unknown): value is AgentToolName {
  return typeof value === "string" && AGENT_TOOL_SET.has(value);
}

export function normalizeEnabledTools(value: unknown): AgentToolName[] | null {
  if (!Array.isArray(value)) return null;

  const seen = new Set<AgentToolName>();
  const next: AgentToolName[] = [];

  for (const item of value) {
    if (!isAgentToolName(item)) return null;
    if (seen.has(item)) continue;
    seen.add(item);
    next.push(item);
  }

  return next;
}

export function getRoleToolSet(role?: string): AgentToolName[] {
  const toolSet = ROLE_TOOL_SETS[role || ""] ?? ROLE_TOOL_SETS.customer_service;
  return [...toolSet];
}

export function resolveAgentTools(role?: string, enabledTools?: unknown): AgentToolName[] {
  const normalized = normalizeEnabledTools(enabledTools);
  return normalized !== null ? normalized : getRoleToolSet(role);
}
