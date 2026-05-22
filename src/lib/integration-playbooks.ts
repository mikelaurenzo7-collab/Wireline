/**
 * Integration playbooks — how callers trigger agent work per connected system.
 * Single source for Fleet canvas, Integration Hub cards, and tool labels.
 */
import type { AgentToolCatalogEntry, AgentToolName, ToolIntegration } from "./agent-capabilities";
import { AGENT_TOOL_CATALOG } from "./agent-capabilities";

export interface IntegrationTask {
  id: string;
  /** What the customer says or the situation on the line */
  callerMoment: string;
  /** What the agent does in Wireline + the integration */
  agentAction: string;
  /** Tool ids that power this moment */
  tools: readonly AgentToolName[];
}

export interface IntegrationPlaybook {
  integration: ToolIntegration;
  label: string;
  headline: string;
  /** One line on the orbit / chip */
  orbitHint: string;
  connectPath: string;
  tasks: readonly IntegrationTask[];
}

const PLAYBOOKS: Record<ToolIntegration, IntegrationPlaybook> = {
  crm: {
    integration: "crm",
    label: "CRM",
    headline: "Every call updates Salesforce or HubSpot — not a sticky note.",
    orbitHint: "Search, log, create deals",
    connectPath: "/integrations",
    tasks: [
      {
        id: "crm-identify",
        callerMoment: '"Do you have my account?" / returning customer',
        agentAction: "Pulls the matching contact and recent pipeline context before answering.",
        tools: ["crm_search_contacts"],
      },
      {
        id: "crm-log",
        callerMoment: "Call ends — outcome, notes, disposition",
        agentAction: "Writes the call summary and disposition to the CRM timeline.",
        tools: ["crm_log_call", "update_lead_status"],
      },
      {
        id: "crm-create",
        callerMoment: '"I\'m interested" / new lead with no record',
        agentAction: "Creates the contact and opens an opportunity in the right pipeline stage.",
        tools: ["crm_create_contact", "crm_create_opportunity", "crm_update_deal_stage"],
      },
    ],
  },
  slack: {
    integration: "slack",
    label: "Slack",
    headline: "Hot leads and escalations hit your team channel in seconds.",
    orbitHint: "Notify #channel on events",
    connectPath: "/integrations",
    tasks: [
      {
        id: "slack-hot",
        callerMoment: "Qualified lead, urgent issue, or compliance flag",
        agentAction: "Posts a structured alert to your default Slack channel with caller context.",
        tools: ["send_slack_notification"],
      },
    ],
  },
  twilio: {
    integration: "twilio",
    label: "Messaging",
    headline: "SMS and WhatsApp follow-ups while the conversation is still warm.",
    orbitHint: "Text + number intelligence",
    connectPath: "/integrations",
    tasks: [
      {
        id: "sms-followup",
        callerMoment: '"Text me the link" / appointment confirmation',
        agentAction: "Sends an SMS or WhatsApp message with the agreed details (with consent).",
        tools: ["send_text_message"],
      },
      {
        id: "sms-validate",
        callerMoment: "New or suspicious number on the line",
        agentAction: "Validates line type and carrier before scheduling callbacks or SMS.",
        tools: ["lookup_phone_number"],
      },
    ],
  },
  zoom: {
    integration: "zoom",
    label: "Zoom",
    headline: "Demo and discovery calls get a join link without back-and-forth email.",
    orbitHint: "Meeting links on bookings",
    connectPath: "/integrations",
    tasks: [
      {
        id: "zoom-book",
        callerMoment: '"Book a video call" / remote appointment',
        agentAction: "Creates a Zoom meeting and attaches the join URL to the calendar event.",
        tools: ["generate_zoom_link", "book_appointment"],
      },
    ],
  },
  calendar: {
    integration: "calendar",
    label: "Calendar",
    headline: "Real availability — no double-books, no 'let me check and call back'.",
    orbitHint: "Check slots · book live",
    connectPath: "/integrations",
    tasks: [
      {
        id: "cal-check",
        callerMoment: '"What times work this week?"',
        agentAction: "Reads connected Google or Microsoft calendars for open slots.",
        tools: ["check_calendar_availability"],
      },
      {
        id: "cal-book",
        callerMoment: '"Book me for Tuesday at 2"',
        agentAction: "Creates the calendar event and confirms time zone with the caller.",
        tools: ["book_appointment"],
      },
    ],
  },
  shopify: {
    integration: "shopify",
    label: "Shopify",
    headline: "Store support calls that actually change orders — not ticket promises.",
    orbitHint: "Orders · returns · draft checkout",
    connectPath: "/integrations",
    tasks: [
      {
        id: "shop-status",
        callerMoment: '"Where is my order?" / tracking',
        agentAction: "Looks up order status, items, and tracking by order # or email.",
        tools: ["shopify_lookup_order", "shopify_lookup_customer"],
      },
      {
        id: "shop-stock",
        callerMoment: '"Do you have this in stock?" / product question',
        agentAction: "Checks catalog inventory and pricing in real time.",
        tools: ["shopify_check_inventory"],
      },
      {
        id: "shop-return",
        callerMoment: '"I need to return this" / cancel before ship',
        agentAction: "Starts a return or cancels an unfulfilled order per your policy.",
        tools: ["shopify_start_return", "shopify_cancel_order"],
      },
      {
        id: "shop-phone-order",
        callerMoment: '"I want to buy over the phone" / address fix',
        agentAction:
          "Builds a draft order, applies a discount, updates shipping, adds internal notes.",
        tools: [
          "shopify_create_draft_order",
          "shopify_apply_discount",
          "shopify_update_address",
          "shopify_add_order_note",
        ],
      },
    ],
  },
  square: {
    integration: "square",
    label: "Square",
    headline: "Phone orders and invoices for Square sellers — same call, paid faster.",
    orbitHint: "Orders · pay links · invoices",
    connectPath: "/integrations",
    tasks: [
      {
        id: "sq-lookup",
        callerMoment: '"What did I order?" / repeat customer',
        agentAction: "Finds Square orders and customer purchase history.",
        tools: ["square_lookup_order", "square_lookup_customer"],
      },
      {
        id: "sq-inventory",
        callerMoment: "Menu / catalog availability",
        agentAction: "Checks Square catalog stock and price.",
        tools: ["square_check_inventory"],
      },
      {
        id: "sq-pay",
        callerMoment: '"Send me a link to pay" / invoice request',
        agentAction: "Creates a payment link or emails a Square invoice.",
        tools: ["square_create_payment_link", "square_send_invoice"],
      },
    ],
  },
  docusign: {
    integration: "docusign",
    label: "DocuSign",
    headline: "Close on the call — contract hits their inbox before they hang up.",
    orbitHint: "E-sign on verbal yes",
    connectPath: "/integrations",
    tasks: [
      {
        id: "ds-send",
        callerMoment: '"Send me the agreement" / verbal commit to sign',
        agentAction: "Dispatches the DocuSign envelope to the email on the call.",
        tools: ["send_contract"],
      },
    ],
  },
  apollo: {
    integration: "apollo",
    label: "Apollo",
    headline: "Unknown caller becomes a qualified profile before your rep takes over.",
    orbitHint: "Enrich by phone",
    connectPath: "/integrations",
    tasks: [
      {
        id: "apollo-enrich",
        callerMoment: "New inbound lead — little context in CRM",
        agentAction: "Enriches title, company size, and LinkedIn from the phone number.",
        tools: ["enrich_lead"],
      },
    ],
  },
  meta: {
    integration: "meta",
    label: "Meta",
    headline: "Paid social leads get server-side credit when they call — not just form fills.",
    orbitHint: "CAPI on qualified calls",
    connectPath: "/integrations",
    tasks: [
      {
        id: "meta-lead",
        callerMoment: "Qualified call from Meta ad / click-to-call",
        agentAction: "Fires a Conversions API event so Meta optimizes toward real conversations.",
        tools: ["meta_submit_lead"],
      },
    ],
  },
  gemini: {
    integration: "gemini",
    label: "Gemini",
    headline: "Live facts when the answer is not in your knowledge base.",
    orbitHint: "Grounded web lookup",
    connectPath: "/integrations",
    tasks: [
      {
        id: "gemini-ground",
        callerMoment: '"What are your hours today?" / regulation / competitor pricing',
        agentAction: "Runs a grounded web search and answers with fresh public data.",
        tools: ["gemini_ground"],
      },
    ],
  },
  microsoft_teams: {
    integration: "microsoft_teams",
    label: "Microsoft Teams",
    headline: "Microsoft shops get Teams alerts instead of another inbox.",
    orbitHint: "Post to Teams channel",
    connectPath: "/integrations",
    tasks: [
      {
        id: "teams-notify",
        callerMoment: "Escalation, booked meeting, or high-value lead",
        agentAction: "Posts to your configured Teams team and channel.",
        tools: ["send_teams_message"],
      },
    ],
  },
  microsoft_excel: {
    integration: "microsoft_excel",
    label: "Excel",
    headline: "Every call becomes a row in your Wireline log workbook — no manual export.",
    orbitHint: "Append call log row",
    connectPath: "/integrations",
    tasks: [
      {
        id: "excel-log",
        callerMoment: "Call completed (any outcome)",
        agentAction: "Appends caller, outcome, and notes to your OneDrive spreadsheet.",
        tools: ["log_to_excel"],
      },
    ],
  },
};

export function getIntegrationPlaybook(
  integration: ToolIntegration,
): IntegrationPlaybook | undefined {
  return PLAYBOOKS[integration];
}

export function getAllIntegrationPlaybooks(): IntegrationPlaybook[] {
  return Object.values(PLAYBOOKS);
}

const catalogByName = new Map(AGENT_TOOL_CATALOG.map((t) => [t.name, t]));

export function getCatalogEntry(name: AgentToolName): AgentToolCatalogEntry | undefined {
  return catalogByName.get(name);
}

/** Tasks for an integration that match tools currently enabled on the agent. */
export function getActiveTasksForIntegration(
  integration: ToolIntegration,
  enabledTools: readonly AgentToolName[],
): IntegrationTask[] {
  const playbook = PLAYBOOKS[integration];
  if (!playbook) return [];
  const enabled = new Set(enabledTools);
  return playbook.tasks.filter((task) => task.tools.some((t) => enabled.has(t)));
}

/** Inbound email — routed mailbox agents (Integration Hub → Email carriers). */
export const EMAIL_INBOUND_TASKS: readonly IntegrationTask[] = [
  {
    id: "email-triage",
    callerMoment: "New thread in connected Gmail / Outlook",
    agentAction:
      "Classifies intent, drafts an on-brand reply, and escalates when confidence is low.",
    tools: ["send_email", "create_fleet_task", "escalate_to_human"],
  },
  {
    id: "email-followup",
    callerMoment: "Customer asks for pricing, scheduling, or docs",
    agentAction:
      "Sends the right follow-up and can book time if calendar tools are enabled on the agent.",
    tools: ["send_email", "check_calendar_availability", "book_appointment"],
  },
] as const;

const PROVIDER_TOOL_INTEGRATION: Partial<
  Record<
    | "salesforce"
    | "hubspot"
    | "slack"
    | "zoom"
    | "apollo"
    | "meta"
    | "shopify"
    | "square"
    | "microsoft_teams"
    | "microsoft_excel",
    ToolIntegration
  >
> = {
  salesforce: "crm",
  hubspot: "crm",
  slack: "slack",
  zoom: "zoom",
  apollo: "apollo",
  meta: "meta",
  shopify: "shopify",
  square: "square",
  microsoft_teams: "microsoft_teams",
  microsoft_excel: "microsoft_excel",
};

export function toolIntegrationForProvider(
  provider: keyof typeof PROVIDER_TOOL_INTEGRATION,
): ToolIntegration | undefined {
  return PROVIDER_TOOL_INTEGRATION[provider];
}

export const PROVIDER_ACCENT: Record<string, string> = {
  salesforce: "#00A1E0",
  hubspot: "#FF7A59",
  slack: "#4A154B",
  zoom: "#2D8CFF",
  apollo: "#8B5CF6",
  meta: "#1877F2",
  shopify: "#96BF48",
  square: "#00A2E8",
  microsoft_teams: "#6264A7",
  microsoft_excel: "#217346",
};

export function validatePlaybookCoverage(): string[] {
  const covered = new Set<AgentToolName>();
  for (const pb of Object.values(PLAYBOOKS)) {
    for (const task of pb.tasks) {
      for (const t of task.tools) covered.add(t);
    }
  }
  const gaps: string[] = [];
  for (const entry of AGENT_TOOL_CATALOG) {
    if (entry.integration && !covered.has(entry.name)) {
      gaps.push(entry.name);
    }
  }
  return gaps;
}
