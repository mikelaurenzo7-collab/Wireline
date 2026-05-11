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
] as const;

export type AgentToolName = typeof AGENT_TOOL_NAME_VALUES[number];

export interface AgentToolCatalogEntry {
  name: AgentToolName;
  label: string;
  description: string;
  integration?: "twilio";
}

export const AGENT_TOOL_CATALOG: readonly AgentToolCatalogEntry[] = [
  { name: "view_recent_interactions", label: "View recent interactions", description: "Loads recent calls and open context for continuity." },
  { name: "escalate_to_human", label: "Escalate to human", description: "Transfers the conversation to a human when risk or complexity is too high." },
  { name: "create_fleet_task", label: "Create fleet task", description: "Queues a follow-up task for a human teammate." },
  { name: "send_email", label: "Send email", description: "Emails confirmations, quotes, summaries, or follow-ups." },
  { name: "send_text_message", label: "Send SMS / WhatsApp", description: "Sends a text follow-up when the customer requested or consented to messaging.", integration: "twilio" },
  { name: "lookup_phone_number", label: "Phone intelligence lookup", description: "Validates a phone number and returns line-type / carrier detail.", integration: "twilio" },
  { name: "add_to_dnc", label: "Add to DNC", description: "Adds a number to the tenant Do Not Call list immediately." },
  { name: "check_calendar_availability", label: "Check calendar availability", description: "Reads connected calendars before proposing a time." },
  { name: "book_appointment", label: "Book appointment", description: "Creates a calendar event once the slot is confirmed." },
  { name: "search_leads", label: "Search leads", description: "Searches the internal lead database for contact context." },
  { name: "update_lead_status", label: "Update lead status", description: "Writes the outcome of the conversation back to CRM." },
  { name: "log_payment_promise", label: "Log payment promise", description: "Records a payment commitment for collections compliance." },
  { name: "create_support_ticket", label: "Create support ticket", description: "Creates a formal support escalation for engineering or specialists." },
  { name: "leave_voicemail", label: "Leave voicemail", description: "Marks voicemail detection and stores the exact voicemail copy used." },
  { name: "schedule_callback", label: "Schedule callback", description: "Schedules an automatic callback at the promised time." },
  { name: "capture_customer_profile", label: "Capture customer profile", description: "Stores structured discovery notes for future interactions." },
] as const;

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
