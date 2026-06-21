export type WorkspaceIntegration = {
  id: string;
  label: string;
  family: string;
  detail: string;
  capabilities: string[];
  connection: "google" | "microsoft" | "workspace";
};

export const WORKSPACE_INTEGRATION_CATALOG: WorkspaceIntegration[] = [
  { id: "google", label: "Google Workspace", family: "Workspace", detail: "One connection for the work your agent needs to see and do.", capabilities: ["Gmail", "Calendar", "Contacts", "Drive", "Sheets"], connection: "google" },
  { id: "microsoft", label: "Microsoft 365", family: "Workspace", detail: "Microsoft work context and collaboration, scoped per agent.", capabilities: ["Outlook", "Calendar", "Teams", "Excel", "OneDrive", "PowerPoint"], connection: "microsoft" },
  { id: "hubspot", label: "HubSpot", family: "CRM", detail: "Contacts, deals, lifecycle updates, and call activity.", capabilities: ["Contacts", "Deals", "Tickets", "Notes"], connection: "workspace" },
  { id: "salesforce", label: "Salesforce", family: "CRM", detail: "Account context, opportunity movement, and activity logging.", capabilities: ["Contacts", "Accounts", "Opportunities", "Tasks"], connection: "workspace" },
  { id: "slack", label: "Slack", family: "Collaboration", detail: "Route urgent outcomes to the people who need them.", capabilities: ["Channel alerts", "Escalations", "Follow-up summaries"], connection: "workspace" },
  { id: "docusign", label: "DocuSign", family: "Contracts", detail: "Send agreements and collect e-signatures when a deal closes.", capabilities: ["Envelope dispatch", "Template send", "Signature status"], connection: "workspace" },
  { id: "zoom", label: "Zoom", family: "Meetings", detail: "Create a real meeting link as part of an approved booking flow.", capabilities: ["Meeting links", "Scheduled meetings"], connection: "workspace" },
  { id: "apollo", label: "Apollo", family: "Prospecting", detail: "Enrich a qualified lead before the next handoff.", capabilities: ["Lead enrichment", "Prospecting context"], connection: "workspace" },
  { id: "meta", label: "Meta", family: "Lead capture", detail: "Pass approved lead outcomes into your acquisition workflow.", capabilities: ["Lead follow-up", "Campaign attribution"], connection: "workspace" },
  { id: "shopify", label: "Shopify", family: "Commerce", detail: "Customer, order, inventory, and merchant support actions.", capabilities: ["Orders", "Customers", "Returns", "Inventory"], connection: "workspace" },
  { id: "square", label: "Square", family: "Commerce", detail: "Customer, order, invoice, and inventory assistance.", capabilities: ["Orders", "Customers", "Invoices", "Inventory"], connection: "workspace" },
  { id: "x", label: "X", family: "Social", detail: "Handle approved social engagement and campaign awareness.", capabilities: ["Mentions", "DMs", "Posts", "Campaign reporting"], connection: "workspace" },
  { id: "yahoo", label: "Yahoo Mail", family: "Email", detail: "Mailbox option outside Google or Microsoft.", capabilities: ["Mailbox connection", "Follow-up"], connection: "workspace" },
  { id: "icloud", label: "iCloud Mail", family: "Email", detail: "Personal mailbox context where iCloud is the operator system of record.", capabilities: ["Mailbox connection", "Follow-up"], connection: "workspace" },
];

export const CASEY_SALES_AGENT_TOOLS = [
  "crm_search_contacts", "crm_log_call", "crm_create_contact", "crm_update_deal_stage",
  "check_calendar_availability", "book_appointment", "generate_zoom_link",
  "send_slack_notification", "send_teams_message", "log_to_excel", "log_to_google_sheets",
  "meta_submit_lead", "escalate_to_human",
] as const;
