import { UNSCOPED_PLATFORM_LIVE_TOOL_NAMES } from "./platform-live-tool-exclusions";
import { UNVERIFIED_LIVE_TOOL_NAMES } from "./unverified-live-tools";

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
  "send_contract",
  "gemini_ground",
  "send_teams_message",
  "log_to_excel",
  "log_to_google_sheets",
  // Device actions (BotBound assistant tools — dispatched to the
  // Account Holder's phone via push; opt-in per agent, never in a customer-facing
  // default role set).
  "navigate_to",
  "add_reminder",
  "play_music",
  // Advanced routing actions
  "route_to_business_unit",
  "trigger_enterprise_webhook",
  // Cloud Computer browser actions
  "start_computer_task",
  "check_computer_task",
  "reply_computer_task",
  "stop_computer_task",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAME_VALUES)[number];

// Keep these catalog names readable in stored selections. They have no
// runtime implementation or can only decline the requested operation.
const UNAVAILABLE_AGENT_TOOL_NAMES = new Set<AgentToolName>([
  "route_to_business_unit",
  "trigger_enterprise_webhook",
]);

/** Actions the owner can configure, independently of plans and connections. */
export function isAgentToolConfigurable(name: AgentToolName): boolean {
  return (
    !UNSCOPED_PLATFORM_LIVE_TOOL_NAMES.has(name) &&
    !UNVERIFIED_LIVE_TOOL_NAMES.has(name) &&
    !UNAVAILABLE_AGENT_TOOL_NAMES.has(name)
  );
}

export type ToolIntegration =
  | "twilio"
  | "calendar"
  | "slack"
  | "x"
  | "zoom"
  | "docusign"
  | "microsoft_teams"
  | "microsoft_excel"
  | "google_sheets";

export interface AgentToolCatalogEntry {
  name: AgentToolName;
  label: string;
  description: string;
  group: "core" | "calendar" | "messaging" | "team" | "meetings" | "device";
  integration?: ToolIntegration;
}

export const AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[] = [
  // Core
  {
    name: "search_knowledge_base",
    label: "Search knowledge base",
    description: "Look up an answer in the agent's approved training material.",
    group: "core",
  },
  {
    name: "view_recent_interactions",
    label: "View recent interactions",
    description:
      "Private call history is unavailable during live calls until caller identity can be verified.",
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
    label: "Route to a team",
    description: "Transfers a caller to a specific internal team, department, or SLA queue.",
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
    label: "Create follow-up task",
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
    description: "Unavailable during live calls until caller identity can be verified.",
    group: "core",
  },
  {
    name: "update_lead_status",
    label: "Update lead status",
    description: "Existing lead changes require team verification; no live call write is made.",
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
    description:
      "Automatic callbacks require verified destination review; record a follow-up task instead.",
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
    description: "Checks Calendar or a connected calendar before proposing a time.",
    group: "calendar",
    integration: "calendar",
  },
  {
    name: "book_appointment",
    label: "Book appointment",
    description: "Books an available time using your Calendar approval preference.",
    group: "calendar",
    integration: "calendar",
  },
  // Messaging
  {
    name: "send_text_message",
    label: "Send SMS",
    description: "Text follow-up after the customer agrees. Recipient permission still applies.",
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
    name: "gemini_ground",
    label: "Grounded web search",
    description:
      "Looks up fresh public info when the answer is not in the agent's knowledge base: pricing, hours, regulations, news. Platform capability; not a merchant OAuth integration.",
    group: "core",
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
      "Appends a row (caller, outcome, and details) to the Account Holder's BotBound Call Log spreadsheet in OneDrive.",
    group: "core",
    integration: "microsoft_excel",
  },
  {
    name: "log_to_google_sheets",
    label: "Log call to Google Sheets",
    description:
      "Appends a row (caller, outcome, and details) to the Account Holder's BotBound Call Log spreadsheet in Google Drive.",
    group: "core",
    integration: "google_sheets",
  },
  // Device actions — BotBound assistant tools. No integration; they
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
  {
    name: "start_computer_task",
    label: "Start Cloud Computer task",
    description:
      "Starts a supervised browser task on the Bot's Cloud Computer and returns the task ID immediately.",
    group: "core",
  },
  {
    name: "check_computer_task",
    label: "Check Cloud Computer task",
    description:
      "Checks the live status, summary, or pending question of a running or recent Cloud Computer browser task.",
    group: "core",
  },
  {
    name: "reply_computer_task",
    label: "Reply to Cloud Computer task",
    description:
      "Sends the caller's or owner's answer to a paused Cloud Computer task waiting for input.",
    group: "core",
  },
  {
    name: "stop_computer_task",
    label: "Stop Cloud Computer task",
    description: "Stops an active Cloud Computer browser task when no longer needed.",
    group: "core",
  },
] as const;

export const ROLE_TOOL_SETS: Record<string, readonly AgentToolName[]> = {
  sales: [
    "search_knowledge_base",
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
    "generate_zoom_link",
    "send_contract",
    "gemini_ground",
    "log_to_excel",
    "log_to_google_sheets",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  customer_service: [
    "search_knowledge_base",
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
    "send_slack_notification",
    "send_teams_message",
    "gemini_ground",
    "log_to_excel",
    "log_to_google_sheets",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  // E-commerce support agents. Order details come from the knowledge base or a team follow-up.
  ecommerce: [
    "search_knowledge_base",
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
    "log_to_excel",
    "log_to_google_sheets",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  scheduler: [
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
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "send_slack_notification",
    "send_teams_message",
    "generate_zoom_link",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  collections: [
    "search_knowledge_base",
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
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  technical_support: [
    "search_knowledge_base",
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
    "log_to_excel",
    "log_to_google_sheets",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  lead_qualifier: [
    "search_knowledge_base",
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
    "generate_zoom_link",
    "gemini_ground",
    "log_to_excel",
    "log_to_google_sheets",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  receptionist: [
    "search_knowledge_base",
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
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  marketing: [
    "search_knowledge_base",
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
    "log_to_excel",
    "log_to_google_sheets",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
  ],
  // Assistant roles focus on scheduling, message-taking, callbacks, and
  // general communication.
  // Workplace alerts, commerce, CRM pipeline, and lead scoring stay opt-in and
  // do not enter the live model context merely because the tenant connected them.
  personal_assistant: [
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
    "leave_voicemail",
    "schedule_callback",
    "capture_customer_profile",
    "generate_zoom_link",
    "gemini_ground",
    "start_computer_task",
    "check_computer_task",
    "reply_computer_task",
    "stop_computer_task",
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

/** Stable compatibility set for capabilities excluded from lightweight roles.
 * Canonical source imported by create defaults and legacy agent records.
 */
export const BUSINESS_TOOL_NAMES = new Set<AgentToolName>([
  "search_leads",
  "update_lead_status",
  "log_payment_promise",
  "capture_customer_profile",
  "add_to_dnc",
  "send_slack_notification",
  // Teams is the same class of workplace-chat tool as Slack. Keeping both in
  // this set preserves the same capability defaults for existing records.
  "send_teams_message",
  "list_x_ad_campaigns",
  "get_x_ad_campaign_stats",
  "send_contract",
  "log_to_excel",
  "log_to_google_sheets",
  "route_to_business_unit",
  "trigger_enterprise_webhook",
]);
