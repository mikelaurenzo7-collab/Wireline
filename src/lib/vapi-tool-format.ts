export type VapiFunctionDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type VapiToolMessage = {
  type: "request-start";
  content: string;
};

export type VapiFunctionTool = {
  type: "function";
  function: VapiFunctionDefinition;
  messages?: VapiToolMessage[];
};

const TOOL_START_MESSAGES: Readonly<Record<string, string>> = {
  search_knowledge_base: "Let me check that.",
  view_recent_interactions: "Let me pull that up.",
  send_email: "Let me prepare that email.",
  send_text_message: "Let me prepare that message.",
  lookup_phone_number: "Let me verify that number.",
  check_calendar_availability: "Let me check the calendar.",
  book_appointment: "Let me book that.",
  search_leads: "Let me pull up the record.",
  escalate_to_human: "Let me connect you now.",
  send_signup_link: "Let me prepare that signup link.",
  create_account: "Let me set that up.",
  send_payment_link: "Let me prepare the secure payment link.",
  gemini_ground: "Let me verify that with current information.",
  enrich_lead: "Let me look that up.",
  generate_zoom_link: "Let me create the meeting link.",
};

const SLOW_TOOL_PREFIXES = [
  "crm_",
  "shopify_",
  "square_",
  "send_slack_",
  "send_teams_",
  "send_contract",
  "post_x_",
  "reply_to_x_",
  "send_x_",
  "list_x_",
  "get_x_",
  "log_to_excel",
  "log_to_google_sheets",
  "meta_",
  "route_to_business_unit",
  "trigger_enterprise_webhook",
] as const;

export function vapiToolRequestStartMessage(name: string): string | undefined {
  const exact = TOOL_START_MESSAGES[name];
  if (exact) return exact;
  if (SLOW_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return "Let me take care of that.";
  }
  return undefined;
}

/** Convert Wireline's role-filtered function definitions to Vapi's current tool DTO. */
export function toVapiFunctionTools(definitions: readonly object[]): VapiFunctionTool[] {
  const tools: VapiFunctionTool[] = [];

  for (const definition of definitions) {
    const raw = definition as {
      name?: unknown;
      description?: unknown;
      parameters?: unknown;
    };
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) continue;

    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    const parameters =
      raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
        ? (raw.parameters as Record<string, unknown>)
        : undefined;
    const requestStart = vapiToolRequestStartMessage(name);

    tools.push({
      type: "function",
      function: {
        name,
        ...(description ? { description } : {}),
        ...(parameters ? { parameters } : {}),
      },
      ...(requestStart
        ? {
            messages: [{ type: "request-start", content: requestStart }],
          }
        : {}),
    });
  }

  return tools;
}
