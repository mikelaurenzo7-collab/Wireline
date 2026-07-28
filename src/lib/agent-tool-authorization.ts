import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  AGENT_TOOL_NAME_VALUES,
  applyPlanToolUnlocks,
  getDefaultAgentTools,
  isAgentToolName,
  type AgentToolName,
} from "./agent-capabilities";
import {
  filterToolsByTenantConnections,
  loadTenantIntegrationConnections,
  type TenantIntegrationConnections,
} from "./tenant-integration-connections";
import type { ToolCallContext } from "../routes/vapi/types";

/**
 * Safety-critical tools that remain callable even when an Account Holder has a
 * narrower active set:
 *
 * - add_to_dnc must remain available for an immediate legal opt-out.
 * - create_followup_task powers the bounded after-hours / insolvency fallback.
 *
 * They bypass the saved selection only after the agent/tenant identity is
 * verified. Neither entry grants access to an external customer system or
 * money movement.
 */
const SYSTEM_RUNTIME_TOOL_NAMES = new Set<AgentToolName>([
  "add_to_dnc",
  "create_followup_task",
]);

export type PersistedAgentToolSelection = readonly AgentToolName[] | null;
export type AgentToolFeatureFlags = {
  aiTier?: string | null;
  twilioMessaging?: boolean;
  twilioLookup?: boolean;
};

/**
 * Resolve a persisted JSON selection without ever expanding malformed data.
 *
 * `null` is the one intentional legacy state and preserves the historical full
 * catalog. Arrays are filtered to known canonical names while retaining order;
 * stale values are ignored instead of invalidating the entire selection. Any
 * other JSON shape fails closed to an empty active set.
 */
export function sanitizePersistedAgentToolSelection(
  value: unknown,
): PersistedAgentToolSelection {
  if (value == null) return null;
  if (!Array.isArray(value)) return [];

  const seen = new Set<AgentToolName>();
  const tools: AgentToolName[] = [];
  for (const item of value) {
    if (!isAgentToolName(item) || seen.has(item)) continue;
    seen.add(item);
    tools.push(item);
  }
  return tools;
}

export function isSystemRuntimeTool(name: string): name is AgentToolName {
  return isAgentToolName(name) && SYSTEM_RUNTIME_TOOL_NAMES.has(name);
}

/**
 * Pure permission resolver shared by runtime authorization and focused tests.
 * It never adds tools beyond the persisted active set (except intentional
 * legacy-null compatibility), and connected-provider requirements are applied
 * after tenant feature flags.
 */
export function resolveAuthorizedAgentTools(
  persisted: PersistedAgentToolSelection,
  flags: AgentToolFeatureFlags,
  connections: TenantIntegrationConnections,
): AgentToolName[] {
  let active = applyPlanToolUnlocks(
    persisted === null ? getDefaultAgentTools() : persisted,
    flags.aiTier,
  );

  if (!flags.twilioMessaging) {
    active = active.filter((tool) => tool !== "send_text_message");
  }
  if (!flags.twilioLookup) {
    active = active.filter((tool) => tool !== "lookup_phone_number");
  }

  return filterToolsByTenantConnections(active, connections);
}

/**
 * Authorize a submitted live tool against the same per-agent selection,
 * connection state, and tenant feature flags used to build the assistant's
 * model tool list. Prompt omission is UX; this check is the execution boundary.
 *
 * Connection state is loaded fresh here rather than read from the short-lived
 * assistant-schema cache. Revoking an integration must stop new writes
 * immediately, not after a cache TTL.
 */
export async function isAgentToolExecutionAuthorized(
  name: string,
  context: ToolCallContext,
): Promise<boolean> {
  if (!isAgentToolName(name) || !context.agent?.id || !context.agent?.user_id) return false;

  const userId = context.agent.user_id;
  const [agentRows, settingsRows, connections] = await Promise.all([
    context.drizzle
      .select({
        role: schema.agents.role,
        enabledTools: schema.agents.enabledTools,
      })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, context.agent.id), eq(schema.agents.userId, userId)))
      .limit(1),
    context.drizzle
      .select({
        aiTier: schema.settings.aiTier,
        twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
        twilioLookupEnabled: schema.settings.twilioLookupEnabled,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1),
    loadTenantIntegrationConnections(userId),
  ]);

  const agentRow = agentRows[0];
  if (!agentRow) return false;

  // Compliance and durable fallback bypass the Account Holder's active-set
  // choice, but never the verified agent/tenant binding above.
  if (isSystemRuntimeTool(name)) return true;

  const settingsRow = settingsRows[0];
  const persisted = sanitizePersistedAgentToolSelection(agentRow.enabledTools);
  const active = resolveAuthorizedAgentTools(
    persisted,
    {
      aiTier: settingsRow?.aiTier,
      twilioMessaging: Boolean(settingsRow?.twilioMessagingEnabled),
      twilioLookup: Boolean(settingsRow?.twilioLookupEnabled),
    },
    connections,
  );

  return active.includes(name);
}

/** Canonical names exported for drift-focused regression contracts. */
export const CANONICAL_AGENT_TOOL_NAMES = AGENT_TOOL_NAME_VALUES;
