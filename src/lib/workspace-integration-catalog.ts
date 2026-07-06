import type { ToolIntegration } from "./agent-capabilities";

export type WorkspaceIntegrationReadiness = "live" | "beta" | "planned" | "platform";

export type WorkspaceIntegration = {
  id: string;
  label: string;
  family: string;
  purpose: string;
  detail: string;
  capabilities: string[];
  agentScope: string;
  guardrail: string;
  readiness: WorkspaceIntegrationReadiness;
  nextStep: string;
  toolIntegrations?: readonly ToolIntegration[];
  connection: "google" | "microsoft" | "workspace" | "platform" | "device";
};

export const WORKSPACE_INTEGRATION_CATALOG: WorkspaceIntegration[] = [
  {
    id: "apple-shortcuts",
    label: "Apple Siri & Shortcuts",
    family: "Device integration",
    purpose: "Native Account Holder entrypoint for asking an agent to act from iOS.",
    detail: "Trigger agents via iOS Intents, Action Button, and Lock Screen.",
    capabilities: ["Ask Wireline", "Place calls", "Summarize recent", "Follow-ups"],
    agentScope: "Account Holder-owned device actions and approved mobile handoffs.",
    guardrail:
      "Not included in customer-facing default agents; each native action remains user-owned.",
    readiness: "beta",
    nextStep:
      "Keep native App Intents and widgets as the OS-level moat; do not replace with a generic wrapper.",
    connection: "device",
  },
  {
    id: "google",
    label: "Google Workspace",
    family: "Workspace",
    purpose: "Primary Google-side work context for mail, calendars, files, and operational sheets.",
    detail: "One connection for the work your agent needs to see and do.",
    capabilities: ["Gmail", "Calendar", "Contacts", "Drive", "Sheets"],
    agentScope:
      "Read mailbox/calendar context, book events, and append approved call-log rows to Sheets.",
    guardrail:
      "OAuth scopes are tenant-owned and should stay visible per connected account and per agent.",
    readiness: "live",
    nextStep:
      "Deepen Drive/Sheets use with templates and row-level audit trails before adding more Google products.",
    toolIntegrations: ["calendar", "google_sheets"],
    connection: "google",
  },
  {
    id: "microsoft",
    label: "Microsoft 365",
    family: "Workspace",
    purpose:
      "Microsoft work graph for Outlook, Teams notifications, Excel logging, and Office context.",
    detail: "Microsoft work context and collaboration, scoped per agent.",
    capabilities: ["Outlook", "Calendar", "Teams", "Excel", "OneDrive", "PowerPoint"],
    agentScope: "Book meetings, post Teams alerts, and append call outcomes to OneDrive workbooks.",
    guardrail:
      "Teams channel selection and Excel target selection must remain explicit after OAuth.",
    readiness: "live",
    nextStep: "Finish richer Teams/Excel setup UX before expanding into PowerPoint automation.",
    toolIntegrations: ["calendar", "microsoft_teams", "microsoft_excel"],
    connection: "microsoft",
  },
  {
    id: "twilio",
    label: "Twilio Messaging",
    family: "Messaging",
    purpose: "SMS, WhatsApp, phone intelligence, and imported number support behind voice agents.",
    detail: "Text follow-ups and phone-number checks while Vapi owns live PSTN call orchestration.",
    capabilities: ["SMS", "WhatsApp", "Phone lookup", "Number import"],
    agentScope:
      "Send consented follow-ups, validate phone numbers, and support call-line provisioning.",
    guardrail:
      "Messaging actions require consent context, DNC enforcement, and carrier-compliant copy.",
    readiness: "platform",
    nextStep:
      "Keep Twilio as the messaging and fallback telephony substrate; do not move live voice off Vapi yet.",
    toolIntegrations: ["twilio"],
    connection: "platform",
  },
  {
    id: "hubspot",
    label: "HubSpot",
    family: "CRM",
    purpose: "SMB CRM memory for contacts, deals, tickets, notes, and call outcomes.",
    detail: "Contacts, deals, lifecycle updates, and call activity.",
    capabilities: ["Contacts", "Deals", "Tickets", "Notes"],
    agentScope:
      "Search records, create contacts, log calls, and move qualified deals after the call outcome.",
    guardrail: "Deal creation and stage movement should stay tied to explicit call evidence.",
    readiness: "live",
    nextStep: "Add field-mapping review before enabling high-volume automated pipeline writes.",
    toolIntegrations: ["crm"],
    connection: "workspace",
  },
  {
    id: "salesforce",
    label: "Salesforce",
    family: "CRM",
    purpose: "Enterprise CRM system of record for accounts, opportunities, activities, and tasks.",
    detail: "Account context, opportunity movement, and activity logging.",
    capabilities: ["Contacts", "Accounts", "Opportunities", "Tasks"],
    agentScope:
      "Search account context, write activity, create contacts, and update opportunity stage.",
    guardrail:
      "Respect tenant role policy and keep admin object mapping separate from caller-facing flows.",
    readiness: "live",
    nextStep:
      "Preserve as the enterprise CRM anchor; deepen object mapping and permission display.",
    toolIntegrations: ["crm"],
    connection: "workspace",
  },
  {
    id: "slack",
    label: "Slack",
    family: "Collaboration",
    purpose:
      "Real-time team alerting for hot leads, escalations, compliance flags, and follow-ups.",
    detail: "Route urgent outcomes to the people who need them.",
    capabilities: ["Channel alerts", "Escalations", "Follow-up summaries"],
    agentScope: "Post structured, scoped notifications to a selected channel.",
    guardrail: "No broad workspace posting; default channel must be selected and auditable.",
    readiness: "live",
    nextStep:
      "Add richer channel previews and notification templates rather than another chat vendor first.",
    toolIntegrations: ["slack"],
    connection: "workspace",
  },
  {
    id: "docusign",
    label: "DocuSign",
    family: "Contracts",
    purpose:
      "E-signature handoff when an agent earns a verbal yes and needs a signature package sent.",
    detail: "Send agreements and collect e-signatures when a deal closes.",
    capabilities: ["Envelope dispatch", "Template send", "Signature status"],
    agentScope: "Dispatch preconfigured envelopes and read status; no free-form contract drafting.",
    guardrail:
      "Template/account configuration stays platform-owned and should require approval copy.",
    readiness: "beta",
    nextStep:
      "Finish envelope-template selection and status callbacks before adding another e-sign vendor.",
    toolIntegrations: ["docusign"],
    connection: "workspace",
  },
  {
    id: "zoom",
    label: "Zoom",
    family: "Meetings",
    purpose: "Video meeting creation for booked demos, consults, and remote support calls.",
    detail: "Create a real meeting link as part of an approved booking flow.",
    capabilities: ["Meeting links", "Scheduled meetings"],
    agentScope: "Generate a meeting link only after the calendar slot is confirmed.",
    guardrail: "Meeting creation should be tied to a calendar booking and caller confirmation.",
    readiness: "beta",
    nextStep:
      "Pair every Zoom link with the calendar event and confirmation audit before expanding providers.",
    toolIntegrations: ["zoom"],
    connection: "workspace",
  },
  {
    id: "apollo",
    label: "Apollo",
    family: "Prospecting",
    purpose: "Lead enrichment when inbound callers or outbound prospects arrive with thin context.",
    detail: "Enrich a qualified lead before the next handoff.",
    capabilities: ["Lead enrichment", "Prospecting context"],
    agentScope:
      "Enrich lead/company details and hand structured context to CRM or human follow-up.",
    guardrail:
      "Use only for business prospecting context; avoid treating enrichment as ground truth.",
    readiness: "live",
    nextStep: "Deepen enrichment provenance and field confidence instead of replacing Apollo now.",
    toolIntegrations: ["apollo"],
    connection: "workspace",
  },
  {
    id: "meta",
    label: "Meta",
    family: "Lead capture",
    purpose:
      "Server-side lead attribution when paid social produces qualified phone conversations.",
    detail: "Pass approved lead outcomes into your acquisition workflow.",
    capabilities: ["Lead follow-up", "Campaign attribution"],
    agentScope:
      "Submit qualified lead conversion events after consented, high-intent conversations.",
    guardrail:
      "Do not send raw call transcripts; keep attribution payloads minimal and hashed where required.",
    readiness: "beta",
    nextStep: "Add event diagnostics and campaign mapping before expanding paid-media connectors.",
    toolIntegrations: ["meta"],
    connection: "workspace",
  },
  {
    id: "shopify",
    label: "Shopify",
    family: "Commerce",
    purpose: "Merchant support and phone-order assistance for stores that run on Shopify.",
    detail: "Customer, order, inventory, and merchant support actions.",
    capabilities: ["Orders", "Customers", "Returns", "Inventory"],
    agentScope:
      "Look up orders, check inventory, start returns, draft orders, and add internal notes.",
    guardrail: "Refunds and irreversible merchant actions stay outside the default agent toolset.",
    readiness: "live",
    nextStep:
      "Polish store-domain onboarding and policy-aware return flows before adding another commerce stack.",
    toolIntegrations: ["shopify"],
    connection: "workspace",
  },
  {
    id: "square",
    label: "Square",
    family: "Commerce",
    purpose: "Local commerce support for Square sellers, invoices, orders, and payment links.",
    detail: "Customer, order, invoice, and inventory assistance.",
    capabilities: ["Orders", "Customers", "Invoices", "Inventory"],
    agentScope:
      "Find orders/customers, check catalog stock, create payment links, and send invoices.",
    guardrail:
      "Payment links and invoices require caller confirmation and should be logged with the call.",
    readiness: "live",
    nextStep:
      "Keep as the local-services commerce anchor; add location-aware inventory and invoice review.",
    toolIntegrations: ["square"],
    connection: "workspace",
  },
  {
    id: "x",
    label: "X",
    family: "Social",
    purpose: "Approved social engagement and paid campaign visibility for account-owned brands.",
    detail: "Handle approved social engagement and campaign awareness.",
    capabilities: ["Mentions", "DMs", "Posts", "Campaign reporting"],
    agentScope:
      "List mentions, draft/post approved replies, send DMs, and read X Ads campaign stats.",
    guardrail:
      "Public posts, replies, likes, reposts, and DMs should require role and approval policy.",
    readiness: "beta",
    nextStep: "Add approval queues and rate-limit transparency before deepening social automation.",
    toolIntegrations: ["x"],
    connection: "workspace",
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    family: "Email",
    purpose: "Mailbox connection for accounts outside Google and Microsoft.",
    detail: "Mailbox option outside Google or Microsoft.",
    capabilities: ["Mailbox connection", "Follow-up"],
    agentScope: "Store OAuth mailbox connection and prepare routed email follow-up flows.",
    guardrail:
      "Yahoo inbox sync is intentionally not presented as complete until XOAUTH2 IMAP is wired.",
    readiness: "planned",
    nextStep: "Finish inbox fetch/send behavior before marketing Yahoo as a full mail carrier.",
    connection: "workspace",
  },
  {
    id: "icloud",
    label: "iCloud Mail",
    family: "Email",
    purpose: "Personal mailbox context where iCloud is the owner system of record.",
    detail: "Personal mailbox context where iCloud is the Account Holder system of record.",
    capabilities: ["Mailbox connection", "Follow-up"],
    agentScope: "Fetch and send mail through app-specific-password IMAP/SMTP after user setup.",
    guardrail:
      "Never store plain app passwords outside encrypted secret storage and clear setup copy.",
    readiness: "live",
    nextStep:
      "Add deliverability diagnostics and mailbox-health copy before adding another consumer mail provider.",
    connection: "workspace",
  },
];

export function workspaceCatalogCoversIntegration(integration: ToolIntegration): boolean {
  return WORKSPACE_INTEGRATION_CATALOG.some((entry) =>
    entry.toolIntegrations?.includes(integration),
  );
}

export const CASEY_SALES_AGENT_TOOLS = [
  "crm_search_contacts",
  "crm_log_call",
  "crm_create_contact",
  "crm_update_deal_stage",
  "check_calendar_availability",
  "book_appointment",
  "generate_zoom_link",
  "send_slack_notification",
  "send_teams_message",
  "log_to_excel",
  "log_to_google_sheets",
  "meta_submit_lead",
  "escalate_to_human",
] as const;
