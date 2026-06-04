/**
 * Scripted integration live-action sequences for the Director streaming UI.
 * Each tool maps to a tailored visual + copy — boxes drop in one-by-one like
 * Claude's partner integrations (Shopify, Slack, etc.).
 */
import type { Dispatch, SetStateAction } from "react";
import type { AgentToolName, ToolIntegration } from "./agent-capabilities";
import { AGENT_TOOL_CATALOG, isAgentToolName } from "./agent-capabilities";

export type IntegrationLiveActionStatus = "pending" | "active" | "success";

export type IntegrationVisualKind =
  | "shopify_store"
  | "shopify_order"
  | "shopify_product"
  | "shopify_customer"
  | "shopify_draft"
  | "hubspot_contact"
  | "hubspot_deal"
  | "slack_message"
  | "teams_message"
  | "twilio_sms"
  | "calendar_slots"
  | "docusign_envelope"
  | "square_payment"
  | "square_catalog"
  | "apollo_profile"
  | "sheets_row"
  | "zoom_meeting"
  | "director_orchestrate";

export interface IntegrationLiveAction {
  id: string;
  integration: ToolIntegration | "director";
  toolName?: AgentToolName;
  title: string;
  detail: string;
  status: IntegrationLiveActionStatus;
  visual: IntegrationVisualKind;
  /** Mock data rendered inside the integration-specific mini UI */
  payload: Record<string, string | number | boolean | undefined>;
  /** Shown when action completes */
  resultLine?: string;
  /** When set, cards reflect real proposals awaiting approval (not scripted mocks). */
  source?: "script" | "proposal";
}

interface ScriptStep {
  toolName?: AgentToolName;
  /** When set, overrides catalog integration (e.g. Director-only orchestration steps). */
  integration?: ToolIntegration | "director";
  visual: IntegrationVisualKind;
  title: string;
  detail: string;
  payload: IntegrationLiveAction["payload"];
  resultLine: string;
}

const TOOL_SCRIPT: Partial<Record<AgentToolName, ScriptStep>> = {
  shopify_lookup_order: {
    toolName: "shopify_lookup_order",
    visual: "shopify_order",
    title: "Look up order",
    detail: "Admin API · orders query",
    payload: { orderNumber: "#1042", status: "Fulfilled", total: "$189.00", items: 2 },
    resultLine: "Order found · tracking attached",
  },
  shopify_check_inventory: {
    toolName: "shopify_check_inventory",
    visual: "shopify_product",
    title: "Check inventory",
    detail: "Products · variants · stock",
    payload: { product: "Heritage Hoodie", sku: "HD-BLK-M", stock: 14, price: "$68" },
    resultLine: "14 units in stock at default location",
  },
  shopify_lookup_customer: {
    toolName: "shopify_lookup_customer",
    visual: "shopify_customer",
    title: "Find customer",
    detail: "Customers · order history",
    payload: { name: "Jordan Lee", email: "j***@email.com", orders: 3, ltv: "$412" },
    resultLine: "Customer profile loaded",
  },
  shopify_create_draft_order: {
    toolName: "shopify_create_draft_order",
    visual: "shopify_draft",
    title: "Create draft order",
    detail: "Draft order · invoice link",
    payload: { draftId: "D-8821", total: "$124.00", payment: "Invoice pending" },
    resultLine: "Draft ready · payment link generated",
  },
  shopify_start_return: {
    toolName: "shopify_start_return",
    visual: "shopify_order",
    title: "Start return",
    detail: "Returns · RMA workflow",
    payload: { orderNumber: "#1042", status: "Return opened", items: 1 },
    resultLine: "Return label queued for merchant approval",
  },
  shopify_cancel_order: {
    toolName: "shopify_cancel_order",
    visual: "shopify_order",
    title: "Cancel order",
    detail: "Order cancel · inventory restock",
    payload: { orderNumber: "#1038", status: "Cancelled", items: 1 },
    resultLine: "Cancellation submitted",
  },
  shopify_update_address: {
    toolName: "shopify_update_address",
    visual: "shopify_order",
    title: "Update shipping address",
    detail: "Shipping address · validation",
    payload: { orderNumber: "#1045", city: "Austin, TX", status: "Address updated" },
    resultLine: "Shipping address saved",
  },
  shopify_add_order_note: {
    toolName: "shopify_add_order_note",
    visual: "shopify_order",
    title: "Add order note",
    detail: "Internal note · staff only",
    payload: { orderNumber: "#1042", note: "Caller requested gift wrap" },
    resultLine: "Note pinned to order timeline",
  },
  square_lookup_order: {
    toolName: "square_lookup_order",
    visual: "square_payment",
    title: "Look up Square order",
    detail: "Orders API · payment status",
    payload: { orderId: "sq-9281", total: "$54.20", status: "COMPLETED" },
    resultLine: "Square order retrieved",
  },
  square_lookup_customer: {
    toolName: "square_lookup_customer",
    visual: "square_payment",
    title: "Find Square customer",
    detail: "Customers · purchase history",
    payload: { name: "Alex Kim", visits: 5, spend: "$280" },
    resultLine: "Customer card loaded",
  },
  square_check_inventory: {
    toolName: "square_check_inventory",
    visual: "square_catalog",
    title: "Check Square catalog",
    detail: "Catalog · inventory counts",
    payload: { item: "Cold Brew Kit", stock: 8, price: "$32" },
    resultLine: "Catalog item in stock",
  },
  square_create_payment_link: {
    toolName: "square_create_payment_link",
    visual: "square_payment",
    title: "Create payment link",
    detail: "Checkout link · SMS ready",
    payload: { amount: "$32.00", link: "square.link/…", status: "Active" },
    resultLine: "Payment link copied to clipboard path",
  },
  crm_search_contacts: {
    toolName: "crm_search_contacts",
    visual: "hubspot_contact",
    title: "Search CRM contacts",
    detail: "HubSpot · contact match",
    payload: { query: "recent inbound lead", matches: 3, owner: "Sales queue" },
    resultLine: "3 contacts matched",
  },
  crm_log_call: {
    toolName: "crm_log_call",
    visual: "hubspot_contact",
    title: "Log call to CRM",
    detail: "Activity · disposition",
    payload: { contact: "Jordan Lee", outcome: "Qualified", duration: "4m 12s" },
    resultLine: "Call logged on contact timeline",
  },
  crm_create_opportunity: {
    toolName: "crm_create_opportunity",
    visual: "hubspot_deal",
    title: "Create deal",
    detail: "Pipeline · stage assignment",
    payload: { deal: "Expansion — Q2", amount: "$4,800", stage: "Qualified" },
    resultLine: "Opportunity opened in pipeline",
  },
  send_slack_notification: {
    toolName: "send_slack_notification",
    visual: "slack_message",
    title: "Post to Slack",
    detail: "#ops-alerts channel",
    payload: { channel: "#ops-alerts", preview: "Director update ready for review" },
    resultLine: "Message delivered to channel",
  },
  send_teams_message: {
    toolName: "send_teams_message",
    visual: "teams_message",
    title: "Post to Teams",
    detail: "General · adaptive card",
    payload: { team: "Operations", preview: "Fleet summary attached" },
    resultLine: "Teams notification sent",
  },
  send_text_message: {
    toolName: "send_text_message",
    visual: "twilio_sms",
    title: "Send SMS",
    detail: "Twilio · outbound message",
    payload: { to: "+1 ••• ••• 4821", segment: "1 segment", status: "Queued" },
    resultLine: "Message queued for delivery",
  },
  lookup_phone_number: {
    toolName: "lookup_phone_number",
    visual: "twilio_sms",
    title: "Phone intelligence",
    detail: "Twilio Lookup · line type",
    payload: { lineType: "Mobile", carrier: "Verified", risk: "Low" },
    resultLine: "Number validated",
  },
  check_calendar_availability: {
    toolName: "check_calendar_availability",
    visual: "calendar_slots",
    title: "Check availability",
    detail: "Cal.com · open slots",
    payload: { date: "Tomorrow", slots: 4, timezone: "America/Chicago" },
    resultLine: "4 slots available",
  },
  book_appointment: {
    toolName: "book_appointment",
    visual: "calendar_slots",
    title: "Book appointment",
    detail: "Cal.com · confirm slot",
    payload: { time: "Tue 2:30 PM", attendee: "Confirmed", calendar: "Sales" },
    resultLine: "Calendar invite sent",
  },
  send_contract: {
    toolName: "send_contract",
    visual: "docusign_envelope",
    title: "Send DocuSign envelope",
    detail: "Template · signature request",
    payload: { template: "Service Agreement", signers: 1, status: "Sent" },
    resultLine: "Envelope out for signature",
  },
  enrich_lead: {
    toolName: "enrich_lead",
    visual: "apollo_profile",
    title: "Enrich lead",
    detail: "Apollo · firmographics",
    payload: { company: "Acme HVAC", title: "Owner", employees: "11-50" },
    resultLine: "Profile enriched",
  },
  generate_zoom_link: {
    toolName: "generate_zoom_link",
    visual: "zoom_meeting",
    title: "Create Zoom meeting",
    detail: "Instant meeting · join URL",
    payload: { topic: "Follow-up call", duration: "30 min", waiting: "On" },
    resultLine: "Join link ready",
  },
  log_to_google_sheets: {
    toolName: "log_to_google_sheets",
    visual: "sheets_row",
    title: "Append to Google Sheets",
    detail: "Fleet log · new row",
    payload: { sheet: "Call outcomes", row: 128, columns: 6 },
    resultLine: "Row appended",
  },
  log_to_excel: {
    toolName: "log_to_excel",
    visual: "sheets_row",
    title: "Append to Excel",
    detail: "Workbook · table row",
    payload: { workbook: "Ops tracker", row: 44, columns: 5 },
    resultLine: "Row written",
  },
  crm_create_contact: {
    toolName: "crm_create_contact",
    visual: "hubspot_contact",
    title: "Create CRM contact",
    detail: "Contacts · new record",
    payload: { name: "New lead", source: "Director", status: "Open" },
    resultLine: "Contact created",
  },
  crm_update_deal_stage: {
    toolName: "crm_update_deal_stage",
    visual: "hubspot_deal",
    title: "Update deal stage",
    detail: "Pipeline · stage move",
    payload: { deal: "Expansion", stage: "Negotiation", amount: "$4,800" },
    resultLine: "Deal stage updated",
  },
  shopify_apply_discount: {
    toolName: "shopify_apply_discount",
    visual: "shopify_draft",
    title: "Apply discount",
    detail: "Draft order · promo code",
    payload: { code: "WELCOME10", total: "$112.50", savings: "$12.50" },
    resultLine: "Discount applied",
  },
  square_send_invoice: {
    toolName: "square_send_invoice",
    visual: "square_payment",
    title: "Send Square invoice",
    detail: "Invoices · payment request",
    payload: { amount: "$89.00", status: "Sent", customer: "Alex Kim" },
    resultLine: "Invoice delivered",
  },
  meta_submit_lead: {
    toolName: "meta_submit_lead",
    visual: "apollo_profile",
    title: "Meta lead event",
    detail: "Conversions API · attribution",
    payload: { event: "Lead", source: "Director", status: "Queued" },
    resultLine: "Conversion event sent",
  },
  search_leads: {
    toolName: "search_leads",
    visual: "apollo_profile",
    title: "Search leads",
    detail: "Pipeline · ICP match",
    payload: { market: "Local services", leads: 25, fit: "High" },
    resultLine: "25 leads matched",
  },
};

const SHOPIFY_PREAMBLE: ScriptStep = {
  toolName: "shopify_lookup_order",
  visual: "shopify_store",
  title: "Connect to Shopify Admin",
  detail: "Store session · API scopes verified",
  payload: { store: "your-store.myshopify.com", api: "Admin GraphQL", scopes: "read_orders" },
  resultLine: "Store connected",
};

const INTENT_PATTERNS: Array<{ re: RegExp; tools: AgentToolName[] }> = [
  {
    re: /\b(shopify|order|#?\d{3,6}|tracking|fulfillment|return|refund|inventory|sku|product)\b/i,
    tools: ["shopify_lookup_order", "shopify_check_inventory", "shopify_lookup_customer"],
  },
  {
    re: /\b(square|pos|payment link|checkout link)\b/i,
    tools: ["square_lookup_order", "square_check_inventory", "square_create_payment_link"],
  },
  {
    re: /\b(crm|hubspot|salesforce|contact|deal|pipeline|opportunity)\b/i,
    tools: ["crm_search_contacts", "crm_create_opportunity", "crm_log_call"],
  },
  {
    re: /\b(slack|notify team|channel)\b/i,
    tools: ["send_slack_notification"],
  },
  {
    re: /\b(research|competitor|market|look up|pricing)\b/i,
    tools: ["search_leads", "enrich_lead", "crm_search_contacts"],
  },
  {
    re: /\b(docusign|contract|sign|signature|envelope)\b/i,
    tools: ["send_contract"],
  },
  {
    re: /\b(zoom|meeting link|video call)\b/i,
    tools: ["generate_zoom_link"],
  },
  {
    re: /\b(sheet|spreadsheet|excel|log this)\b/i,
    tools: ["log_to_google_sheets", "log_to_excel"],
  },
  {
    re: /\b(text|sms|message|whatsapp|phone)\b/i,
    tools: ["send_text_message", "lookup_phone_number"],
  },
  {
    re: /\b(book|calendar|appointment|schedule|slot)\b/i,
    tools: ["check_calendar_availability", "book_appointment"],
  },
  {
    re: /\b(contract|docusign|sign|signature)\b/i,
    tools: ["send_contract"],
  },
  {
    re: /\b(lead|prospect|apollo|enrich)\b/i,
    tools: ["search_leads", "enrich_lead"],
  },
];

function toolIntegration(tool: AgentToolName): ToolIntegration | "director" {
  const entry = AGENT_TOOL_CATALOG.find((c) => c.name === tool);
  return entry?.integration ?? "director";
}

function stepToAction(step: ScriptStep, id: string): IntegrationLiveAction {
  return {
    id,
    integration: step.integration ?? (step.toolName ? toolIntegration(step.toolName) : "director"),
    toolName: step.toolName,
    title: step.title,
    detail: step.detail,
    status: "pending",
    visual: step.visual,
    payload: step.payload,
    resultLine: step.resultLine,
  };
}

const DIRECTOR_FALLBACK: ScriptStep[] = [
  {
    integration: "director",
    visual: "director_orchestrate",
    title: "Scan fleet context",
    detail: "Agents · settings · recent calls",
    payload: { mode: "Fleet", signals: "Active" },
    resultLine: "Context loaded",
  },
  {
    integration: "director",
    visual: "director_orchestrate",
    title: "Plan executable path",
    detail: "Actions · approvals · integrations",
    payload: { mode: "Orchestrate", cards: "Ready" },
    resultLine: "Plan staged",
  },
];

export function planIntegrationLiveScript(input: {
  message: string;
  enabledTools: string[];
}): IntegrationLiveAction[] {
  const enabled = input.enabledTools.filter(isAgentToolName);
  const enabledSet = new Set(enabled);
  const msg = input.message.trim();

  const matchedTools: AgentToolName[] = [];
  for (const { re, tools } of INTENT_PATTERNS) {
    if (re.test(msg)) {
      for (const t of tools) {
        if (enabledSet.has(t) && !matchedTools.includes(t)) matchedTools.push(t);
      }
    }
  }

  if (matchedTools.length === 0) {
    for (const t of enabled) {
      if (TOOL_SCRIPT[t] && matchedTools.length < 3) matchedTools.push(t);
    }
  }

  const steps: ScriptStep[] = [];

  const usesShopify = matchedTools.some((t) => t.startsWith("shopify_"));
  if (usesShopify) steps.push(SHOPIFY_PREAMBLE);

  for (const tool of matchedTools.slice(0, 4)) {
    const script = TOOL_SCRIPT[tool];
    if (script) steps.push(script);
  }

  if (steps.length === 0) {
    for (const s of DIRECTOR_FALLBACK) steps.push(s);
  }

  return steps.map((s, i) =>
    stepToAction(s, `live-${s.toolName ?? "director"}-${i}-${Date.now()}`),
  );
}

/** Build live-feed cards from real Director proposals (post-stream / pre-approval). */
export function buildLiveActionsFromProposals(input: {
  integrationJobs?: Array<{
    tool: AgentToolName;
    label: string;
    summary: string;
    query?: string;
    step?: number;
  }>;
  actions?: Array<{ kind: string; label: string; to?: string; step?: number }>;
}): IntegrationLiveAction[] {
  const out: IntegrationLiveAction[] = [];
  let idx = 0;

  for (const action of input.actions || []) {
    const visual =
      action.kind === "make_call"
        ? "twilio_sms"
        : action.kind === "send_text_message"
          ? "twilio_sms"
          : "director_orchestrate";
    out.push({
      id: `proposal-action-${idx++}`,
      integration:
        action.kind === "send_text_message" || action.kind === "make_call" ? "twilio" : "director",
      title: action.step ? `Step ${action.step} · ${action.label}` : action.label,
      detail: action.to ? `To ${action.to}` : "Awaiting approval",
      status: "pending",
      visual,
      payload: { to: action.to, status: "Proposal" },
      resultLine: "Approve below to execute",
      source: "proposal",
    });
  }

  for (const job of input.integrationJobs || []) {
    const script = TOOL_SCRIPT[job.tool];
    const base: ScriptStep = script ?? {
      toolName: job.tool,
      visual: "director_orchestrate",
      title: job.label,
      detail: job.summary,
      payload: { query: job.query || job.summary },
      resultLine: "Awaiting approval",
    };
    out.push({
      ...stepToAction(
        {
          ...base,
          title: job.step ? `Step ${job.step} · ${job.label}` : job.label,
          detail: job.summary,
          payload: {
            ...base.payload,
            query: job.query || job.summary,
          },
          resultLine: "Approve below to execute",
        },
        `proposal-job-${idx++}`,
      ),
      status: "pending",
      source: "proposal",
    });
  }

  return out;
}

/** Timing for dropping actions into the live feed (ms). */
export const LIVE_ACTION_TIMINGS = {
  firstDelay: 380,
  stagger: 780,
  activeDuration: 720,
} as const;

/** Run timed drop-in sequence; returns cleanup. */
export function startIntegrationLiveSequence(
  script: IntegrationLiveAction[],
  setActions: Dispatch<SetStateAction<IntegrationLiveAction[]>>,
): () => void {
  const timeouts: number[] = [];
  setActions([]);

  script.forEach((action, index) => {
    const activateAt = LIVE_ACTION_TIMINGS.firstDelay + index * LIVE_ACTION_TIMINGS.stagger;
    const completeAt = activateAt + LIVE_ACTION_TIMINGS.activeDuration;

    timeouts.push(
      window.setTimeout(() => {
        setActions((prev) => [...prev, { ...action, status: "active" }]);
      }, activateAt),
    );
    timeouts.push(
      window.setTimeout(() => {
        setActions((prev) =>
          prev.map((a) => (a.id === action.id ? { ...a, status: "success" } : a)),
        );
      }, completeAt),
    );
  });

  return () => timeouts.forEach((t) => window.clearTimeout(t));
}
