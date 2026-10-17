import type { AgentToolName } from "./agent-capabilities";

/** Live voice has no strong caller verification for these private record reads. */
export const PRIVATE_LIVE_READ_TOOL_NAMES = new Set<AgentToolName>([
  "search_leads",
  "crm_search_contacts",
  "view_recent_interactions",
  "square_lookup_order",
  "square_lookup_customer",
]);

/** These writes identify an existing record or callback target by caller ID. */
export const CALLER_LINKED_LIVE_WRITE_TOOL_NAMES = new Set<AgentToolName>([
  "update_lead_status",
  "crm_log_call",
  "schedule_callback",
]);

export const UNVERIFIED_LIVE_TOOL_NAMES = new Set<AgentToolName>([
  ...PRIVATE_LIVE_READ_TOOL_NAMES,
  ...CALLER_LINKED_LIVE_WRITE_TOOL_NAMES,
  "square_create_payment_link",
]);

export const PRIVATE_LIVE_READ_DENIAL =
  "I can't safely verify this caller for private account details during this call. No records were shared. Offer a team follow-up.";

export const CALLER_LINKED_LIVE_WRITE_DENIAL =
  "I can't safely verify this caller to change an existing record or schedule an automatic callback. No records were changed and no callback was scheduled. Offer a team follow-up.";

export const SQUARE_PAYMENT_LINK_DENIAL =
  "I can't verify a Square checkout amount from the caller's request. No payment link was created. Offer a team follow-up to confirm the item and price.";
