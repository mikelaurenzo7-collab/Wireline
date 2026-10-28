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
import type { ToolCallContext } from "./agent-tool-types";
import { getTenantChannelEntitlements } from "./channel-entitlements";
import { isAgentToolChannelAllowed } from "./agent-tool-channel-policy";
import type { CommunicationChannel } from "./plan-catalog";
import { UNVERIFIED_LIVE_TOOL_NAMES } from "./unverified-live-tools";

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
const SYSTEM_RUNTIME_TOOL_NAMES = new Set<AgentToolName>(["add_to_dnc", "create_followup_task"]);
const CLOUD_COMPUTER_RUNTIME_TOOL_NAMES = new Set<AgentToolName>([
  "start_computer_task",
  "check_computer_task",
  "reply_computer_task",
  "stop_computer_task",
]);

export const NO_TENANT_INTEGRATIONS: TenantIntegrationConnections = {
  shopify: false,
  square: false,
  slack: false,
  x: false,
  microsoft_teams: false,
  microsoft_excel: false,
  google_sheets: false,
  salesforce: false,
  hubspot: false,
  zoom: false,
  google_calendar: false,
  microsoft_calendar: false,
  native_calendar: false,
  native_calendar_configured: false,
  google_mail: false,
  microsoft_mail: false,
};

export type PersistedAgentToolSelection = readonly AgentToolName[] | null;
export type AgentToolFeatureFlags = {
  aiTier?: string | null;
  twilioMessaging?: boolean;
  twilioLookup?: boolean;
  channels?: readonly CommunicationChannel[];
};

type AgentAuthorizationSnapshot = {
  enabledTools: unknown;
  flags: AgentToolFeatureFlags;
  connections: TenantIntegrationConnections;
};

/**
 * Concurrent tool calls from one Vapi batch share one fresh authorization
 * snapshot. Entries exist only while the read is in flight, so a later webhook
 * turn or integration revocation performs a new lookup.
 */
const inFlightAuthorizationSnapshots = new Map<
  string,
  Promise<AgentAuthorizationSnapshot | null>
>();

/**
 * Resolve a persisted JSON selection without ever expanding malformed data.
 *
 * `null` is the one intentional legacy state and preserves the historical full
 * catalog. Arrays are filtered to known canonical names while retaining order;
 * stale values are ignored instead of invalidating the entire selection. Any
 * other JSON shape fails closed to an empty active set.
 */
export function sanitizePersistedAgentToolSelection(value: unknown): PersistedAgentToolSelection {
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

  return filterToolsByTenantConnections(active, connections).filter((tool) =>
    isAgentToolChannelAllowed(tool, flags.channels),
  );
}

function callIdFromContext(context: ToolCallContext): string {
  const messageCallId = (context.message.call as { id?: unknown } | undefined)?.id;
  const payloadCallId = (context.payload.call as { id?: unknown } | undefined)?.id;
  const callId = messageCallId || payloadCallId;
  return typeof callId === "string" && callId.trim() ? callId.trim() : `tool:${context.toolCallId}`;
}

function snapshotKey(context: ToolCallContext, agentId: string, userId: string): string {
  return `${userId}:${agentId}:${callIdFromContext(context)}`;
}

async function loadAuthorizationSnapshot(
  context: ToolCallContext,
  agentId: string,
  userId: string,
): Promise<AgentAuthorizationSnapshot | null> {
  const key = snapshotKey(context, agentId, userId);
  const existing = inFlightAuthorizationSnapshots.get(key);
  if (existing) return existing;

  const snapshotPromise = Promise.all([
    context.drizzle
      .select({
        enabledTools: schema.agents.enabledTools,
        aiTier: schema.settings.aiTier,
        twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
        twilioLookupEnabled: schema.settings.twilioLookupEnabled,
      })
      .from(schema.agents)
      .leftJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1),
    loadTenantIntegrationConnections(userId).catch((error: unknown) => {
      context.log.warn("Agent integration lookup failed; disabling connected tools", {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return NO_TENANT_INTEGRATIONS;
    }),
    getTenantChannelEntitlements(userId, context.drizzle).catch((error: unknown) => {
      context.log.warn("Agent channel lookup failed; disabling customer send tools", {
        agentId,
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      return { channels: [] };
    }),
  ]).then(([rows, connections, entitlements]) => {
    const row = rows[0];
    if (!row) return null;
    return {
      enabledTools: row.enabledTools,
      flags: {
        aiTier: row.aiTier,
        twilioMessaging: Boolean(row.twilioMessagingEnabled),
        twilioLookup: Boolean(row.twilioLookupEnabled),
        channels: entitlements.channels,
      },
      connections,
    };
  });

  inFlightAuthorizationSnapshots.set(key, snapshotPromise);
  const cleanup = () => {
    if (inFlightAuthorizationSnapshots.get(key) === snapshotPromise) {
      inFlightAuthorizationSnapshots.delete(key);
    }
  };
  void snapshotPromise.then(cleanup, cleanup);
  return snapshotPromise;
}

async function hasVerifiedAgentIdentity(
  context: ToolCallContext,
  agentId: string,
  userId: string,
): Promise<boolean> {
  const rows = await context.drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * Authorize a submitted live tool against the same per-agent selection,
 * connection state, and tenant feature flags used to build the assistant's
 * model tool list. Prompt omission is UX; this check is the execution boundary.
 *
 * Connection state is loaded fresh here rather than read from the short-lived
 * assistant-schema cache. Revoking an integration stops the next webhook turn,
 * while concurrent calls in the current tool batch share the same in-flight
 * snapshot to stay within the database pool.
 */
export async function isAgentToolExecutionAuthorized(
  name: string,
  context: ToolCallContext,
): Promise<boolean> {
  if (!isAgentToolName(name)) return false;
  if (UNVERIFIED_LIVE_TOOL_NAMES.has(name)) return false;

  const agentId = context.agent?.id || context.agentId || context.webhookAgentId;
  const userId = context.agent?.user_id || context.userId;

  // Compliance and durable fallback bypass the Account Holder's active-set
  // choice and all unrelated integration reads, but never the verified
  // agent/tenant binding.
  if (isSystemRuntimeTool(name)) {
    if (!agentId || !userId) return false;
    return hasVerifiedAgentIdentity(context, agentId, userId);
  }

  if (CLOUD_COMPUTER_RUNTIME_TOOL_NAMES.has(name)) {
    if (!agentId || !userId) return true;
    if (typeof (context.drizzle as { select?: unknown } | undefined)?.select === "function") {
      return hasVerifiedAgentIdentity(context, agentId, userId);
    }
    return true;
  }

  if (!agentId || !userId) return false;

  const snapshot = await loadAuthorizationSnapshot(context, agentId, userId);
  if (!snapshot) return false;

  const persisted = sanitizePersistedAgentToolSelection(snapshot.enabledTools);
  return resolveAuthorizedAgentTools(persisted, snapshot.flags, snapshot.connections).includes(
    name,
  );
}

/** Canonical names exported for drift-focused regression contracts. */
export const CANONICAL_AGENT_TOOL_NAMES = AGENT_TOOL_NAME_VALUES;
