import type { AgentToolName } from "./agent-capabilities";

/**
 * These services currently use Wireline-owned platform credentials and do not
 * have a tenant account/template/pixel ownership registry. They must not be
 * exposed to arbitrary live tenant agents: X Ads would disclose Wireline's
 * campaign data, DocuSign would send from Wireline's account, and Meta lead
 * events would pollute Wireline's conversion destination.
 *
 * The underlying server services remain available to deliberate internal
 * workflows. Re-enable live use only after the resource is bound to userId.
 */
export const UNSCOPED_PLATFORM_LIVE_TOOL_NAMES = new Set<AgentToolName>([
  "list_x_ad_campaigns",
  "get_x_ad_campaign_stats",
  "send_contract",
  "meta_submit_lead",
]);
