export const AGENT_TOOL_NAME_VALUES = [
  "search_knowledge_base",
  "view_recent_interactions",
  "escalate_to_human",
  "create_followup_task",
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
  "post_x_tweet",
  "reply_to_x_tweet",
  "like_x_tweet",
  "repost_x_tweet",
  "send_x_dm",
  "list_x_mentions",
  "list_x_ad_campaigns",
  "get_x_ad_campaign_stats",
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
  "shopify_create_draft_order",
  "shopify_add_order_note",
  "square_lookup_order",
  "square_lookup_customer",
  "square_check_inventory",
  "square_create_payment_link",
  "send_teams_message",
  "log_to_excel",
  "log_to_google_sheets",
  "meta_submit_lead",
  "crm_create_contact",
  "crm_update_deal_stage",
  "shopify_apply_discount",
  "square_send_invoice",
  // Device actions (Wireline personal-assistant tools — dispatched to the
  // Account Holder's phone via push; opt-in per agent, never in a customer-facing
  // default role set).
  "navigate_to",
  "add_reminder",
  "play_music",
  // Enterprise/Business Agent exclusive actions
  "route_to_business_unit",
  "trigger_enterprise_webhook",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAME_VALUES)[number];

export type ToolIntegration =
  | "twilio"
  | "calendar"
  | "crm"
  | "slack"
  | "x"
  | "zoom"
  | "docusign"
  | "apollo"
  | "meta"
  | "shopify"
  | "square"
  | "microsoft_teams"
  | "microsoft_excel"
  | "google_sheets";

export interface AgentToolCatalogEntry {
  name: AgentToolName;
  label: string;
  description: string;
  group: "core" | "calendar" | "crm" | "messaging" | "team" | "meetings" | "ecommerce" | "device";
  integration?: ToolIntegration;
}

export const AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[] = [
  // Core
  {
    name: "view_recent_interactions",
    label: "View recent interactions",
    description: "Recent context.",
    group: "core",
  },
  {
    name: "escalate_to_human",
    label: "Escalate to human",
    description: "Hand off tough ones.",
    group: "core",
  },
  {
    name: "route_to_business_unit",
    label: "Route to business unit",
    description:
      "Enterprise routing: Transfers caller to a specific internal department or SLA queue.",
    group: "core",
  },
  {
    name: "trigger_enterprise_webhook",
    label: "Trigger enterprise webhook",
    description:
      "Fires an authenticated webhook payload to your enterprise data lake or internal tools.",
    group: "core",
  },
  {
    name: "create_followup_task",
    label: "Create Assistants task",
    description: "Queue follow-up.",
    group: "core",
  },
  {
    name: "send_email",
    label: "Send email",
    description: "Send summaries.",
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
    description: "Text follow-up.",
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
    description: "Slack alert.",
    group: "team",
    integration: "slack",
  },
  {
    name: "post_x_tweet",
    label: "Post on X",
    description:
      "Publishes a tweet to the Account Holder's connected X account (max 280 characters).",
    group: "messaging",
    integration: "x",
  },
  {
    name: "reply_to_x_tweet",
    label: "Reply on X",
    description: "Posts a public reply to a specific tweet ID from the connected X account.",
    group: "messaging",
    integration: "x",
  },
  {
    name: "like_x_tweet",
    label: "Like on X",
    description: "Likes a tweet by ID using the connected X account.",
    group: "messaging",
    integration: "x",
  },
  {
    name: "repost_x_tweet",
    label: "Repost on X",
    description: "Reposts (retweets) a tweet by ID from the connected X account.",
    group: "messaging",
    integration: "x",
  },
  {
    name: "send_x_dm",
    label: "Send X DM",
    description: "Sends a direct message on X to a user ID or @username.",
    group: "messaging",
    integration: "x",
  },
  {
    name: "list_x_mentions",
    label: "List X mentions",
    description: "Fetches recent @mentions for the connected X account to triage replies.",
    group: "messaging",
    integration: "x",
  },
  {
    name: "list_x_ad_campaigns",
    label: "List X ad campaigns",
    description: "Lists active X Ads campaigns (platform Ads API credentials required).",
    group: "messaging",
    integration: "x",
  },
  {
    name: "get_x_ad_campaign_stats",
    label: "X ad campaign stats",
    description: "Returns impressions, clicks, and spend for an X Ads campaign ID.",
    group: "messaging",
    integration: "x",
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
    label: "Grounded web search",
    description:
      "Looks up fresh public info when the answer is not in the agent's knowledge base — pricing, hours, regulations, news. Platform capability; not a merchant OAuth integration.",
    group: "core",
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
  {
    name: "shopify_create_draft_order",
    label: "Create Shopify draft order",
    description:
      "Builds a phone-order draft in Shopify and returns an invoice/payment link the customer can use to pay.",
    group: "ecommerce",
    integration: "shopify",
  },
  {
    name: "shopify_add_order_note",
    label: "Add Shopify order note",
    description:
      "Adds an internal note on an order for the merchant team (call summary, special instructions).",
    group: "ecommerce",
    integration: "shopify",
  },
  // E-commerce — Square
  {
    name: "square_lookup_order",
    label: "Look up Square order",
    description:
      "Finds a Square order by order ID or customer email — returns status, items, and totals.",
    group: "ecommerce",
    integration: "square",
  },
  {
    name: "square_lookup_customer",
    label: "Look up Square customer",
    description: "Finds a Square customer by email or phone with their purchase history.",
    group: "ecommerce",
    integration: "square",
  },
  {
    name: "square_check_inventory",
    label: "Check Square inventory",
    description: "Searches the Square catalog for products and returns live stock and pricing.",
    group: "ecommerce",
    integration: "square",
  },
  {
    name: "square_create_payment_link",
    label: "Create Square payment link",
    description:
      "Generates a Square checkout link for a product or service. Send via SMS or email after confirming with the caller.",
    group: "ecommerce",
    integration: "square",
  },
  // Microsoft 365
  {
    name: "send_teams_message",
    label: "Notify team via Microsoft Teams",
    description:
      "Posts a message to the Account Holder's Microsoft Teams channel when something important happens on a call.",
    group: "team",
    integration: "microsoft_teams",
  },
  {
    name: "log_to_excel",
    label: "Log call to Excel",
    description:
      "Appends a row — caller, outcome, and details — to the Account Holder's Wireline Call Log spreadsheet in OneDrive.",
    group: "core",
    integration: "microsoft_excel",
  },
  {
    name: "log_to_google_sheets",
    label: "Log call to Google Sheets",
    description:
      "Appends a row — caller, outcome, and details — to the Account Holder's Wireline Call Log spreadsheet in Google Drive.",
    group: "core",
    integration: "google_sheets",
  },
  // Meta CAPI
  {
    name: "meta_submit_lead",
    label: "Submit lead to Meta",
    description:
      "Fires a server-side Conversions API event so qualified leads are attributed back to the Meta ad campaign that drove the call.",
    group: "core",
    integration: "meta",
  },
  // CRM extended
  {
    name: "crm_create_contact",
    label: "Create CRM contact",
    description:
      "Creates a new contact record in Salesforce or HubSpot from caller data captured during the call.",
    group: "crm",
    integration: "crm",
  },
  {
    name: "crm_update_deal_stage",
    label: "Update deal stage",
    description:
      "Moves an existing deal or opportunity to the next pipeline stage based on the call outcome.",
    group: "crm",
    integration: "crm",
  },
  // Shopify extended
  {
    name: "shopify_apply_discount",
    label: "Apply Shopify discount",
    description:
      "Not available on live calls yet — do not promise a discount was applied. Collect details and offer human follow-up, or use draft-order / order-note tools.",
    group: "ecommerce",
    integration: "shopify",
  },
  // Square extended
  {
    name: "square_send_invoice",
    label: "Send Square invoice",
    description:
      "Not available on live calls yet — do not claim an invoice was sent. Prefer square_create_payment_link or record the request for the account holder.",
    group: "ecommerce",
    integration: "square",
  },
  // Device actions — Wireline personal-assistant tools. No integration; they
  // dispatch a push to the Account Holder's phone, which deep-links Maps / writes a
  // calendar event / opens music. Opt-in per agent via enabledTools.
  {
    name: "navigate_to",
    label: "Navigate to a place",
    description: "Sends turn-by-turn directions to a destination to the Account Holder's phone.",
    group: "device",
  },
  {
    name: "add_reminder",
    label: "Add a reminder",
    description: "Creates a calendar reminder on the Account Holder's phone.",
    group: "device",
  },
  {
    name: "play_music",
    label: "Play music",
    description:
      "Opens music playback for a song, artist, or playlist on the Account Holder's phone.",
    group: "device",
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
  "shopify_create_draft_order",
  "shopify_add_order_note",
  "shopify_apply_discount",
];

/** Tool names that require a connected Square account. */
export const SQUARE_TOOL_NAMES: readonly AgentToolName[] = [
  "square_lookup_order",
  "square_lookup_customer",
  "square_check_inventory",
  "square_create_payment_link",
  "square_send_invoice",
];

export const ROLE_TOOL_SETS: Record<string, readonly AgentToolName[]> = {
  sales: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "crm_create_contact",
    "crm_update_deal_stage",
    "send_slack_notification",
    "send_teams_message",
    "generate_zoom_link",
    "send_contract",
    "enrich_lead",
    "gemini_ground",
    "meta_submit_lead",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  customer_service: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "send_teams_message",
    "gemini_ground",
    "shopify_lookup_order",
    "shopify_check_inventory",
    "shopify_lookup_customer",
    "shopify_start_return",
    "shopify_cancel_order",
    "shopify_update_address",
    "shopify_create_draft_order",
    "shopify_add_order_note",
    "square_lookup_order",
    "square_lookup_customer",
    "square_check_inventory",
    "square_create_payment_link",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  // E-commerce support agents — order status, inventory, returns, address fixes.
  ecommerce: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "create_support_ticket",
    "send_slack_notification",
    "send_teams_message",
    "gemini_ground",
    "shopify_lookup_order",
    "shopify_check_inventory",
    "shopify_lookup_customer",
    "shopify_start_return",
    "shopify_cancel_order",
    "shopify_update_address",
    "shopify_create_draft_order",
    "shopify_add_order_note",
    "square_lookup_order",
    "square_lookup_customer",
    "square_check_inventory",
    "square_create_payment_link",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  scheduler: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "send_teams_message",
    "generate_zoom_link",
    "crm_search_contacts",
  ],
  collections: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "send_slack_notification",
    "send_teams_message",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  technical_support: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "send_slack_notification",
    "send_teams_message",
    "gemini_ground",
    "crm_search_contacts",
    "crm_log_call",
    "shopify_lookup_order",
    "shopify_lookup_customer",
    "square_lookup_order",
    "square_lookup_customer",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  lead_qualifier: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "crm_create_contact",
    "crm_update_deal_stage",
    "send_slack_notification",
    "send_teams_message",
    "generate_zoom_link",
    "enrich_lead",
    "gemini_ground",
    "meta_submit_lead",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  receptionist: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "send_teams_message",
    "generate_zoom_link",
    "gemini_ground",
    "crm_search_contacts",
  ],
  marketing: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
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
    "send_slack_notification",
    "send_teams_message",
    "enrich_lead",
    "meta_submit_lead",
    "crm_search_contacts",
    "crm_log_call",
    "crm_create_contact",
    "log_to_excel",
    "log_to_google_sheets",
  ],
  // Personal assistants — represent an individual person, not a business.
  // Focused on scheduling, message-taking, callbacks, and general communication.
  // Workplace alerts, commerce, CRM pipeline, and lead scoring stay opt-in and
  // do not enter the live model context merely because the tenant connected them.
  personal_assistant: [
    "view_recent_interactions",
    "escalate_to_human",
    "create_followup_task",
    "send_email",
    "send_text_message",
    "lookup_phone_number",
    "add_to_dnc",
    "check_calendar_availability",
    "book_appointment",
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "generate_zoom_link",
    "gemini_ground",
  ],
};

/**
 * Plan entitlement controls whether a tenant may select a capability; it must
 * never activate tools that the Account Holder excluded from a specific agent.
 * Every tier can choose eligible connected integrations, while the supplied
 * list remains authoritative for the live runtime. The aiTier parameter remains
 * for call-site stability and future entitlement policy.
 */
export function applyPlanToolUnlocks(
  tools: readonly AgentToolName[],
  _aiTier?: string | null,
): AgentToolName[] {
  return [...tools];
}

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

/** Full integration toolbox available when an agent has no explicit selection. */
export function getDefaultAgentTools(): AgentToolName[] {
  return [...AGENT_TOOL_NAME_VALUES];
}

/**
 * Resolve which tools an agent may use. An explicit enabled_tools array is the
 * authoritative active set. Legacy agents without a saved selection retain the
 * full catalog so this policy change does not silently remove existing behavior.
 */
export function resolveAgentTools(_role?: string, enabledTools?: unknown): AgentToolName[] {
  const normalized = normalizeEnabledTools(enabledTools);
  return normalized !== null ? normalized : getDefaultAgentTools();
}

/** Tool names that are business/enterprise only (used for splitting everyday vs business in UIs).
 *  Canonical source - imported by per-agent workspace and ActionsWorkspace.
 */
export const BUSINESS_TOOL_NAMES = new Set<AgentToolName>([
  "search_leads",
  "update_lead_status",
  "log_payment_promise",
  "capture_customer_profile",
  "add_to_dnc",
  "crm_search_contacts",
  "crm_log_call",
  "crm_create_opportunity",
  "send_slack_notification",
  // Teams is the same class of workplace-chat tool as Slack. Leaving it out
  // let personal creates keep a business-workspace integration and split it
  // to the wrong side of the everyday/business UI grouping.
  "send_teams_message",
  "list_x_ad_campaigns",
  "get_x_ad_campaign_stats",
  "send_contract",
  "enrich_lead",
  "shopify_lookup_order",
  "shopify_check_inventory",
  "shopify_lookup_customer",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
  "shopify_create_draft_order",
  "shopify_add_order_note",
  "shopify_apply_discount",
  "square_lookup_order",
  "square_lookup_customer",
  "square_check_inventory",
  "square_create_payment_link",
  "square_send_invoice",
  "log_to_excel",
  "log_to_google_sheets",
  "meta_submit_lead",
  "crm_create_contact",
  "crm_update_deal_stage",
  "route_to_business_unit",
  "trigger_enterprise_webhook",
]);
