import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  AGENT_TOOL_NAME_VALUES,
  isAgentToolName,
  type AgentToolName,
} from "./agent-capabilities";
import { buildRoleToolDefsForTenant } from "./vapi-helpers";
import type { ToolCallContext } from "../routes/vapi/types";

/**
 * Safety-critical tools that remain callable even when an Account Holder has a
 * narrower active set:
 *
 * - add_to_dnc must remain available for an immediate legal opt-out.
 * - create_followup_task powers the bounded after-hours / insolvency fallback.
 *
 * Neither entry grants access to an external customer system or money movement.
 */
const SYSTEM_RUNTIME_TOOL_NAMES = new Set<string>(["add_to_dnc", "create_followup_task"]);

export type PersistedAgentToolSelection = readonly AgentToolName[] | null;

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

export function isSystemRuntimeTool(name: string): boolean {
  return SYSTEM_RUNTIME_TOOL_NAMES.has(name);
}

function definitionName(definition: object): string | null {
  const name = (definition as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * Authorize a submitted live tool against the same per-agent selection,
 * connection state, and tenant feature flags used to build the assistant's
 * model tool list. Prompt omission is UX; this check is the execution boundary.
 */
export async function isAgentToolExecutionAuthorized(
  name: string,
  context: ToolCallContext,
): Promise<boolean> {
  if (isSystemRuntimeTool(name)) return true;
  if (!context.agent?.id || !context.agent?.user_id) return false;

  const [agentRow] = await context.drizzle
    .select({
      role: schema.agents.role,
      enabledTools: schema.agents.enabledTools,
    })
    .from(schema.agents)
    .where(
      and(
        eq(schema.agents.id, context.agent.id),
        eq(schema.agents.userId, context.agent.user_id),
      ),
    )
    .limit(1);

  if (!agentRow) return false;

  const [settingsRow] = await context.drizzle
    .select({
      aiTier: schema.settings.aiTier,
      twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
      twilioLookupEnabled: schema.settings.twilioLookupEnabled,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, context.agent.user_id))
    .limit(1);

  const persisted = sanitizePersistedAgentToolSelection(agentRow.enabledTools);
  const definitions = await buildRoleToolDefsForTenant(
    agentRow.role || "customer_service",
    persisted,
    context.agent.user_id,
    settingsRow?.aiTier,
    {
      twilioMessaging: Boolean(settingsRow?.twilioMessagingEnabled),
      twilioLookup: Boolean(settingsRow?.twilioLookupEnabled),
    },
  );

  return definitions.some((definition) => definitionName(definition) === name);
}

/** Canonical names exported for drift-focused regression contracts. */
export const CANONICAL_AGENT_TOOL_NAMES = AGENT_TOOL_NAME_VALUES;
