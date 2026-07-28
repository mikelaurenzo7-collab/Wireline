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

const DESTINATION_CONFIRMATION_TOOLS = new Set([
  "send_email",
  "send_text_message",
  "send_signup_link",
  "send_payment_link",
  "send_contract",
  "send_x_dm",
]);

const MATERIAL_WRITE_TOOLS = new Set([
  "book_appointment",
  "create_account",
  "crm_create_opportunity",
  "crm_create_contact",
  "crm_update_deal_stage",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
  "shopify_create_draft_order",
  "shopify_apply_discount",
  "square_create_payment_link",
  "square_send_invoice",
  "post_x_tweet",
  "reply_to_x_tweet",
  "like_x_tweet",
  "repost_x_tweet",
  "route_to_business_unit",
  "trigger_enterprise_webhook",
]);

export function vapiToolRequestStartMessage(name: string): string | undefined {
  const exact = TOOL_START_MESSAGES[name];
  if (exact) return exact;
  if (SLOW_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return "Let me take care of that.";
  }
  return undefined;
}

export function vapiToolExecutionGuidance(name: string): string | undefined {
  if (DESTINATION_CONFIRMATION_TOOLS.has(name)) {
    return "Confirm the destination aloud immediately before calling this tool. Use only caller-approved content. After the result, say the action completed only when the result explicitly confirms success; otherwise state the failure honestly and offer a safe alternative.";
  }
  if (MATERIAL_WRITE_TOOLS.has(name)) {
    return "Immediately before calling this tool, confirm the critical identity, item, amount, date, destination, or requested change with the caller. Never claim completion until the tool result explicitly confirms success.";
  }
  if (name === "add_to_dnc") {
    return "Execute immediately on an opt-out request. Confirm removal only when the result explicitly says the suppression was recorded.";
  }
  return undefined;
}

function augmentedDescription(name: string, description: string): string {
  const guidance = vapiToolExecutionGuidance(name);
  if (!guidance) return description;
  return `${description}${description ? " " : ""}${guidance}`.slice(0, 1_000);
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

    const rawDescription = typeof raw.description === "string" ? raw.description.trim() : "";
    const description = augmentedDescription(name, rawDescription);
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
