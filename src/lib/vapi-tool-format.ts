export type VapiFunctionDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type VapiToolMessage =
  | {
      type: "request-start";
      content: string;
      blocking?: boolean;
    }
  | {
      type: "request-response-delayed";
      content: string;
      timingMilliseconds: number;
    }
  | {
      type: "request-failed";
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
  "schedule_callback",
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

const TOOL_PREREQUISITE_GUIDANCE: Readonly<Record<string, string>> = {
  send_email:
    "Confirm the recipient address and what the caller wants sent. Never guess an address.",
  // The verbal opt-in script carries all four carrier-required consent
  // elements (Twilio campaign-rejection code 30924): message type, frequency,
  // rate disclosure, and opt-out instructions. The decline handling mirrors
  // codes 30923/30931 — consent must be refusable and never a condition of
  // service, and a declined ask is not re-asked.
  send_text_message:
    'Before any text, capture verbal consent with exactly: "Want me to text that to you at this number? It will be one message with the info you asked for. Message and data rates may apply, and you can reply STOP at any time to opt out." Send only after the caller clearly agrees, only to the number the caller approved, and confirm the requested content. If the caller declines, continue helping them normally and do not ask again on this call — texting is never a condition of service.',
  book_appointment:
    "Call check_calendar_availability first, then confirm the exact date, time, IANA timezone, attendee name, and service.",
  schedule_callback:
    "Confirm the exact callback date, time, timezone, and purpose immediately before scheduling.",
  add_to_dnc:
    "Execute immediately when the caller opts out. Do not make them repeat the request or attempt to persuade them to stay subscribed.",
  create_account:
    "Confirm the caller's full name and email address, and explain that a secure password-setup email will follow.",
  send_signup_link: "Confirm the caller's email address before sending the signup link.",
  send_payment_link:
    "Confirm the recipient and selected plan or payment purpose before sending the secure link.",
  send_contract:
    "Confirm the recipient name, email, and intended agreement. Never infer a template or binding commitment.",
  shopify_start_return:
    "Look up the order first, confirm the exact order and return reason, and explain that this opens a request rather than issuing a refund.",
  shopify_cancel_order:
    "Look up the order first and confirm the exact order is eligible and the caller explicitly wants it cancelled.",
  shopify_update_address:
    "Look up the order first, confirm it has not shipped, and read the complete new address back before saving.",
  shopify_create_draft_order:
    "Verify the product or variant, quantity, price, and customer email before creating the draft order.",
  square_create_payment_link:
    "Confirm the item or service and exact amount before generating the payment link.",
  square_send_invoice:
    "Confirm the customer, line items, amount, and delivery address before sending the invoice.",
  post_x_tweet:
    "Publish only after the Account Holder explicitly requests it and confirms the final public text.",
  reply_to_x_tweet: "Confirm the target post and final public reply before publishing.",
  repost_x_tweet: "Repost only after an explicit request for that exact post.",
  send_x_dm: "Confirm the recipient and final private message before sending.",
  crm_create_opportunity:
    "Confirm the contact, opportunity name, stage, and any amount before creating the deal.",
  crm_update_deal_stage:
    "Confirm the exact deal and intended stage before changing pipeline state.",
  route_to_business_unit:
    "Confirm the caller's need and destination, then preserve the reason and relevant context for the receiving team.",
};

export function vapiToolRequestStartMessage(name: string): string | undefined {
  const exact = TOOL_START_MESSAGES[name];
  if (exact) return exact;
  if (SLOW_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return "Let me take care of that.";
  }
  return undefined;
}

export function vapiToolMessages(name: string): VapiToolMessage[] | undefined {
  const requestStart = vapiToolRequestStartMessage(name);
  if (!requestStart) return undefined;
  return [
    { type: "request-start", content: requestStart },
    {
      type: "request-response-delayed",
      content: "I'm still working on that.",
      timingMilliseconds: 2_500,
    },
    {
      type: "request-failed",
      content: "I couldn't complete that action just now.",
    },
  ];
}

export function vapiToolExecutionGuidance(name: string): string | undefined {
  const specific = TOOL_PREREQUISITE_GUIDANCE[name];
  const completionRule =
    DESTINATION_CONFIRMATION_TOOLS.has(name) ||
    MATERIAL_WRITE_TOOLS.has(name) ||
    name === "add_to_dnc"
      ? "After the result, say the action completed only when the result explicitly confirms success. If it fails, times out, or remains uncertain, state that plainly and offer a safe follow-up; never invent queueing or completion."
      : "";
  const genericConfirmation =
    MATERIAL_WRITE_TOOLS.has(name) && !specific
      ? "Immediately before calling this tool, confirm the critical identity, item, amount, date, destination, or requested change with the caller."
      : "";
  const guidance = [specific, genericConfirmation, completionRule].filter(Boolean).join(" ");
  return guidance || undefined;
}

function augmentedDescription(name: string, description: string): string {
  const guidance = vapiToolExecutionGuidance(name);
  if (!guidance) return description;
  return `${description}${description ? " " : ""}${guidance}`.slice(0, 1_400);
}

function calendarSafeParameters(
  name: string,
  parameters: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!parameters || (name !== "check_calendar_availability" && name !== "book_appointment")) {
    return parameters;
  }

  const existingProperties =
    parameters.properties &&
    typeof parameters.properties === "object" &&
    !Array.isArray(parameters.properties)
      ? (parameters.properties as Record<string, unknown>)
      : {};
  const existingRequired = Array.isArray(parameters.required)
    ? parameters.required.filter((item): item is string => typeof item === "string")
    : [];

  const properties: Record<string, unknown> = {
    ...existingProperties,
    date: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description:
        "Exact local calendar date in YYYY-MM-DD format. Resolve relative phrases using the current date before calling the tool.",
    },
    timezone: {
      type: "string",
      description:
        "Confirmed IANA timezone such as America/Chicago, America/New_York, Europe/London, or Asia/Tokyo. Never use an abbreviation alone.",
    },
  };
  if (name === "book_appointment") {
    properties.time = {
      type: "string",
      pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
      description: "Exact local appointment time in 24-hour HH:mm format.",
    };
  }

  return {
    ...parameters,
    type: "object",
    properties,
    required: [
      ...new Set([
        ...existingRequired,
        "date",
        "timezone",
        ...(name === "book_appointment" ? ["time"] : []),
      ]),
    ],
  };
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
    const rawParameters =
      raw.parameters && typeof raw.parameters === "object" && !Array.isArray(raw.parameters)
        ? (raw.parameters as Record<string, unknown>)
        : undefined;
    const parameters = calendarSafeParameters(name, rawParameters);
    const messages = vapiToolMessages(name);

    tools.push({
      type: "function",
      function: {
        name,
        ...(description ? { description } : {}),
        ...(parameters ? { parameters } : {}),
      },
      ...(messages ? { messages } : {}),
    });
  }

  return tools;
}
