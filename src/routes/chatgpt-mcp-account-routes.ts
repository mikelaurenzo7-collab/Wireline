import express, { type Request, type Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { type AgentCustomizationInput, assertDraftConfirmation } from "../lib/agent-customization";
import {
  createAgentDraft,
  getAgentDraft,
  updateAgentDraft,
  type AgentDraftPrincipal,
} from "../lib/agent-draft-service";
import { CHATGPT_MCP_RESOURCE_URI, MCP_SCOPES, type McpScope } from "../lib/chatgpt-mcp";
import {
  CHATGPT_ACCOUNT_WIDGET_URI,
  buildAccountBoundWidgetHtml,
} from "../lib/chatgpt-mcp-account";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  mcpUiResourceMeta,
} from "../lib/mcp-app-metadata";
import { isRetiredMcpClient, mcpDraftSourceForClient } from "../lib/mcp-client-registry";
import {
  assertMcpDraftWriteRateLimit,
  hashMcpOAuthToken,
  isMcpResourceBound,
  mcpIssuer,
} from "../lib/mcp-oauth-security";
import {
  applyMcpTransportHeaders,
  isMcpNotificationMethod,
  mcpOAuthChallenge,
  mcpToolErrorResult,
} from "../lib/mcp-transport";
import { drizzle, log, quotaTracker, tenantStore } from "../lib/server-context";
import {
  commitPlatformCostReservation,
  markPlatformCostReservationAmbiguous,
  platformCostReserveUsd,
  releasePlatformCostReservation,
  reservePlatformCostRecord,
} from "../middleware/audit-middleware";
import { OPENAI_REALTIME_DEFAULT_MODEL } from "../lib/voice/openai-realtime-config";
import { rateLimit } from "../lib/rate-limit";
import { createOpenAIRealtimeSimulationCall } from "../lib/voice/openai-realtime-service";
import { isLaunchHardBlocked } from "../lib/launch-readiness";
import { isRuntimeAvailable } from "../lib/ai-client";
import { addAgentTrainingItem, getAgentCoachingBrief } from "../lib/mcp-agent-coaching";
import { readMcpCoachingWritesEnabled } from "../lib/mcp-coaching-preferences";
import { mcpVoiceSimulationMeta } from "../lib/mcp-voice-simulation-meta";
import { runPrivateAgentTestTurn } from "../lib/private-agent-test";
import { isHardSpendCapExceeded } from "../lib/spend-guards";
import { shouldRetainRealtimeReservation } from "../lib/realtime-provider-outcome";
import { assertLiveExternalActionAllowed } from "../lib/account-environment-policy";
import { BOT_MARK_IDENTITY_CAPACITY } from "../lib/bot-mark";
import * as schema from "../db/schema";

const router = express.Router();

type McpPrincipal = AgentDraftPrincipal & {
  scopes: McpScope[];
  draftSource: "chatgpt_mcp" | "claude_mcp" | "cursor_mcp";
};

class McpAuthorizationError extends Error {
  constructor(
    readonly requiredScope: McpScope,
    readonly oauthError: "invalid_token" | "insufficient_scope" = "invalid_token",
  ) {
    super("Connect a BotBound account to continue.");
  }
}

function issuer(req: Request): string {
  return mcpIssuer(req);
}

function tokenHash(value: string): string {
  return hashMcpOAuthToken(value);
}

function text(value: unknown, max = 2048): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isoDateOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseScopes(value: string): McpScope[] {
  const known = new Set<string>(MCP_SCOPES);
  return [...new Set(value.split(/\s+/).filter((scope): scope is McpScope => known.has(scope)))];
}

async function principalFromRequest(req: Request): Promise<McpPrincipal | null> {
  const raw = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")?.[1]?.trim();
  if (!raw || raw.length > 1000) return null;
  const result = (await drizzle.execute(sql`
    SELECT user_id, email, scope, resource, client_id, expires_at
    FROM wireline_mcp_access_tokens
    WHERE token_hash = ${tokenHash(raw)}
    LIMIT 1
  `)) as unknown as {
    rows?: Array<{
      user_id: string;
      email: string;
      scope: string;
      resource: string | null;
      client_id: string;
      expires_at: Date | string;
    }>;
  };
  const record = result.rows?.[0];
  if (!record || new Date(record.expires_at).getTime() <= Date.now()) return null;
  if (isRetiredMcpClient(record.client_id || "")) return null;
  if (!isMcpResourceBound(record.resource, req)) return null;
  const scopes = parseScopes(record.scope);
  if (!scopes.length) return null;

  let redirectUris: string[] = [];
  const clientId = record.client_id || "";
  if (clientId) {
    const clients = (await drizzle.execute(sql`
      SELECT redirect_uris
      FROM wireline_mcp_oauth_clients
      WHERE client_id = ${clientId}
      LIMIT 1
    `)) as unknown as { rows?: Array<{ redirect_uris: unknown }> };
    const rawUris = clients.rows?.[0]?.redirect_uris;
    redirectUris = Array.isArray(rawUris)
      ? rawUris.filter((value): value is string => typeof value === "string")
      : [];
  }

  return {
    userId: record.user_id,
    email: record.email,
    scopes,
    draftSource: mcpDraftSourceForClient(clientId, redirectUris),
  };
}

function requireScope(principal: McpPrincipal | null, scope: McpScope): McpPrincipal {
  if (!principal) throw new McpAuthorizationError(scope, "invalid_token");
  if (!principal.scopes.includes(scope))
    throw new McpAuthorizationError(scope, "insufficient_scope");
  return principal;
}

function assertRehearsalConfirmation(value: unknown) {
  if (value !== true) {
    throw AppError.fromHttpStatus(
      400,
      "Confirm that you want to trigger this private BotBound rehearsal before continuing.",
    );
  }
}

function assertTrainingConfirmation(value: unknown) {
  if (value !== true) {
    throw AppError.fromHttpStatus(
      400,
      "Confirm that you want this Training fact or rule to land in the BotBound workspace.",
    );
  }
}

function jsonRpc(res: Response, id: unknown, result: unknown, status = 200) {
  res
    .status(status)
    .type("application/json")
    .json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(
  res: Response,
  id: unknown,
  code: number,
  message: string,
  status = 200,
  data?: unknown,
) {
  res
    .status(status)
    .type("application/json")
    .json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
}

const draftOutputSchema = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    agent_name: { type: "string" },
    role: { type: "string" },
    business_name: { type: "string" },
    primary_goal: { type: "string" },
    tone: { type: "string" },
    rules: { type: "array", items: { type: "string" } },
    prohibited_topics: { type: "array", items: { type: "string" } },
    allowed_actions: { type: "array", items: { type: "string" } },
    escalation_policy: { type: "string" },
    knowledge_summary: { type: "string" },
    lifecycle: { const: "draft" },
    open_in_wireline_url: { type: "string" },
  },
  required: [
    "agent_id",
    "agent_name",
    "role",
    "business_name",
    "primary_goal",
    "lifecycle",
    "open_in_wireline_url",
  ],
  additionalProperties: false,
};

const workspaceSummaryOutputSchema = {
  type: "object",
  properties: {
    agent_count: { type: "integer" },
    assigned_phone_number_count: { type: "integer" },
    calls_last_30_days: { type: "integer" },
    text_threads_last_30_days: { type: "integer" },
    email_threads_last_30_days: { type: "integer" },
    unread_text_count: { type: "integer" },
    unread_email_count: { type: "integer" },
    activated: { type: "boolean" },
    subscription_status: { type: "string" },
    texting_configured: { type: "boolean" },
    email_connected: { type: "boolean" },
    latest_activity_at: { type: "string" },
    open_in_wireline_url: { type: "string" },
  },
  required: [
    "agent_count",
    "assigned_phone_number_count",
    "calls_last_30_days",
    "text_threads_last_30_days",
    "email_threads_last_30_days",
    "unread_text_count",
    "unread_email_count",
    "activated",
    "subscription_status",
    "texting_configured",
    "email_connected",
    "latest_activity_at",
    "open_in_wireline_url",
  ],
  additionalProperties: false,
};

const agentStatusOutputSchema = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    agent_name: { type: "string" },
    role: { type: "string" },
    channel: { type: "string" },
    on_phone_network: { type: "boolean" },
    next_step: { type: "string" },
    open_in_wireline_url: { type: "string" },
    training_url: { type: "string" },
    wire_url: { type: "string" },
  },
  required: [
    "agent_id",
    "agent_name",
    "role",
    "channel",
    "on_phone_network",
    "next_step",
    "open_in_wireline_url",
    "training_url",
    "wire_url",
  ],
  additionalProperties: false,
};

const coachingBriefOutputSchema = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    agent_name: { type: "string" },
    role: { type: "string" },
    channel: { type: "string" },
    on_phone_network: { type: "boolean" },
    training_fact_count: { type: "integer" },
    operating_rule_count: { type: "integer" },
    training_facts: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, content: { type: "string" } },
        required: ["id", "content"],
        additionalProperties: false,
      },
    },
    operating_rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          priority: { type: "integer" },
        },
        required: ["id", "content", "priority"],
        additionalProperties: false,
      },
    },
    next_step: { type: "string" },
    open_in_wireline_url: { type: "string" },
  },
  required: [
    "agent_id",
    "agent_name",
    "role",
    "channel",
    "on_phone_network",
    "training_fact_count",
    "operating_rule_count",
    "training_facts",
    "operating_rules",
    "next_step",
    "open_in_wireline_url",
  ],
  additionalProperties: false,
};

const trainingWriteOutputSchema = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    kind: { type: "string", enum: ["fact", "rule"] },
    item_id: { type: "string" },
    content: { type: "string" },
    landed_in_wireline: { const: true },
    open_in_wireline_url: { type: "string" },
  },
  required: [
    "agent_id",
    "kind",
    "item_id",
    "content",
    "landed_in_wireline",
    "open_in_wireline_url",
  ],
  additionalProperties: false,
};

const privateTurnOutputSchema = {
  type: "object",
  properties: {
    agent_id: { type: "string" },
    agent_name: { type: "string" },
    reply: { type: "string" },
    live_call: { const: false },
  },
  required: ["agent_id", "agent_name", "reply", "live_call"],
  additionalProperties: false,
};

function toStructuredDraft(view: Awaited<ReturnType<typeof getAgentDraft>>["view"], req: Request) {
  return {
    agent_id: view.id,
    agent_name: view.name,
    role: view.role,
    business_name: view.businessName,
    primary_goal: view.primaryGoal,
    tone: view.tone,
    rules: view.rules,
    prohibited_topics: view.prohibitedTopics,
    allowed_actions: view.allowedActions,
    escalation_policy: view.escalationPolicy,
    knowledge_summary: view.knowledgeSummary,
    lifecycle: view.lifecycle,
    open_in_wireline_url: `${issuer(req)}${view.openInWirelinePath}`,
  };
}

function toolDefinitions() {
  const widgetMeta = {
    ui: { resourceUri: CHATGPT_ACCOUNT_WIDGET_URI },
    "openai/outputTemplate": CHATGPT_ACCOUNT_WIDGET_URI,
    "openai/widgetAccessible": true,
  };
  const toolMeta = (
    securitySchemes: Array<{ type: "oauth2"; scopes: McpScope[] }>,
    visibility?: string[],
  ) => ({
    ...widgetMeta,
    ...(visibility
      ? {
          ui: { resourceUri: CHATGPT_ACCOUNT_WIDGET_URI, visibility },
          "openai/visibility": visibility.includes("model") ? "public" : "private",
        }
      : { ui: { resourceUri: CHATGPT_ACCOUNT_WIDGET_URI, visibility: ["app", "model"] } }),
    securitySchemes,
  });
  const customizationProperties = {
    agent_name: { type: "string", description: "The name the agent uses with callers." },
    business_name: {
      type: "string",
      title: "Represented name",
      description: "The person, organization, or brand the Bot represents.",
    },
    role: { type: "string", enum: ["receptionist", "scheduler", "sales", "customer_service"] },
    primary_goal: { type: "string", description: "The main outcome the agent should drive." },
    tone: { type: "string", description: "Speaking style, such as warm, concise, and capable." },
    success_criteria: {
      type: "array",
      items: { type: "string" },
      description: "Observable outcomes that define a useful conversation.",
    },
    rules: {
      type: "array",
      items: { type: "string" },
      description: "Specific operating rules the agent must follow.",
    },
    prohibited_topics: {
      type: "array",
      items: { type: "string" },
      description: "Topics the agent must avoid or escalate.",
    },
    allowed_actions: {
      type: "array",
      items: { type: "string" },
      description:
        "Actions the account holder wants the agent to support when configured in BotBound.",
    },
    escalation_policy: {
      type: "string",
      enum: ["take_message", "handoff_when_configured", "never"],
    },
    knowledge_summary: {
      type: "string",
      description:
        "Key approved knowledge the Bot should use until fuller knowledge sources are added in BotBound.",
    },
  };

  return [
    {
      name: "create_agent_draft",
      title: "Create a BotBound agent draft",
      description:
        "Creates a persistent, private, unlaunched Bot in the connected user’s BotBound workspace. Use this to help a new user build their first Bot after they create a BotBound account. Before calling, summarize the proposed identity, goal, rules, and action boundaries, then obtain explicit confirmation. This does not attach a phone number, send a message, place a call, or launch the Bot.",
      inputSchema: {
        type: "object",
        properties: {
          ...customizationProperties,
          confirmed: {
            type: "boolean",
            description: "True only after the user explicitly confirms creation.",
          },
        },
        required: ["business_name", "primary_goal", "confirmed"],
        additionalProperties: false,
      },
      outputSchema: draftOutputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.write"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.write"] }]),
    },
    {
      name: "get_agent_draft",
      title: "Get a BotBound agent draft",
      description:
        "Reads the connected user’s private agent draft, including its current customization profile and launch state.",
      inputSchema: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
        additionalProperties: false,
      },
      outputSchema: draftOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.read"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.read"] }]),
    },
    {
      name: "update_agent_draft",
      title: "Update a BotBound agent draft",
      description:
        "Updates the connected user’s private unlaunched BotBound draft. Before calling, summarize the configuration changes and obtain explicit confirmation. It does not launch the agent or activate an external action.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          ...customizationProperties,
          confirmed: {
            type: "boolean",
            description: "True only after the user explicitly confirms the private draft update.",
          },
        },
        required: ["agent_id", "confirmed"],
        additionalProperties: false,
      },
      outputSchema: draftOutputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.write"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.write"] }]),
    },
    {
      name: "start_private_voice_simulation",
      title: "Start a private voice simulation",
      description:
        "App-only signaling for a server-bounded, tool-free voice simulation of one connected user’s BotBound draft. The widget supplies a WebRTC offer after explicit confirmation and receives an SDP answer without a provider credential. The simulation cannot make calls, send messages, access connected systems, or complete an external action.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          offer_sdp: {
            type: "string",
            minLength: 100,
            maxLength: 60000,
            description: "The ChatGPT widget's WebRTC SDP offer for this confirmed simulation.",
          },
          confirmed: {
            type: "boolean",
            description:
              "True only after the user explicitly asks to start this private voice simulation.",
          },
        },
        required: ["agent_id", "offer_sdp", "confirmed"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: { status: { const: "ready" }, agent_id: { type: "string" } },
        required: ["status", "agent_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["demo.voice"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["demo.voice"] }], ["app"]),
    },
    {
      name: "list_wireline_agents",
      title: "List BotBound agents",
      description:
        "Lists the connected user’s BotBound agents and drafts. Use this for status or configuration questions about that user’s workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: {
        type: "object",
        properties: {
          agents: {
            type: "array",
            maxItems: BOT_MARK_IDENTITY_CAPACITY,
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                mark_key: { type: ["string", "null"] },
                role: { type: "string" },
                channel: { type: "string" },
              },
              required: ["id", "name", "mark_key", "role", "channel"],
              additionalProperties: false,
            },
          },
        },
        required: ["agents"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.read"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.read"] }]),
    },
    {
      name: "get_wireline_workspace_summary",
      title: "Get BotBound workspace summary",
      description:
        "Returns aggregate operational status for the connected BotBound workspace: agents, assigned phone numbers, recent call/text/email activity, unread counts, channel connection state, activation, and subscription status. It never returns customer identities, message bodies, transcripts, recordings, credentials, or provider secrets.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: workspaceSummaryOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.read"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.read"] }]),
    },
    {
      name: "get_wireline_agent_status",
      title: "Get BotBound agent status",
      description:
        "Returns one connected user’s agent: whether it is on the phone network, the next BotBound step, and deep links into the Workspace, Knowledge, and Connections. It never returns phone numbers, customer identities, transcripts, or message bodies.",
      inputSchema: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
        additionalProperties: false,
      },
      outputSchema: agentStatusOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.read"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.read"] }]),
    },
    {
      name: "run_private_agent_turn",
      title: "Run a private agent rehearsal",
      description:
        "Triggers one connected user’s BotBound agent in a private, tool-free text rehearsal. Use this to hear how the agent would answer a hypothetical customer line from Cursor, ChatGPT, or Claude. It does not place a live call, send a message, book anything, or launch the agent.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          customer_message: {
            type: "string",
            description: "Hypothetical customer line for the private rehearsal.",
          },
          confirmed: {
            type: "boolean",
            description:
              "True only after the user explicitly asks to trigger this private rehearsal.",
          },
        },
        required: ["agent_id", "customer_message", "confirmed"],
        additionalProperties: false,
      },
      outputSchema: privateTurnOutputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["demo.voice"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["demo.voice"] }]),
    },
    {
      name: "get_agent_coaching_brief",
      title: "Get a BotBound coaching brief",
      description:
        "Returns owner-authored Training facts and operating rules for one connected user’s agent, plus the next coaching step. Use this to gameplan. It never returns customer identities, transcripts, recordings, or phone numbers.",
      inputSchema: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
        additionalProperties: false,
      },
      outputSchema: coachingBriefOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.read"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.read"] }]),
    },
    {
      name: "train_wireline_agent",
      title: "Train a BotBound agent",
      description:
        "Saves a confirmed Training fact or operating rule into the connected user’s BotBound workspace so it is live in Training. The account holder must enable connected-app Training writes in BotBound Apps first. This does not launch the agent, attach a number, or contact a customer.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          kind: {
            type: "string",
            enum: ["fact", "rule"],
            description: "fact lands in Training knowledge. rule lands as an operating directive.",
          },
          content: { type: "string", description: "The fact or rule to persist in BotBound." },
          confirmed: {
            type: "boolean",
            description:
              "True only after the user explicitly confirms this should land in BotBound.",
          },
        },
        required: ["agent_id", "kind", "content", "confirmed"],
        additionalProperties: false,
      },
      outputSchema: trainingWriteOutputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.write"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.write"] }]),
    },
  ];
}

function resourceMeta(req: Request) {
  return mcpUiResourceMeta(`${issuer(req)}/mcp`);
}

const MCP_PROMPTS = [
  {
    name: "create_first_voice_agent",
    title: "Create your first Bot",
    description:
      "Help a new BotBound user create their first confirmed private draft from a conversation, then privately rehearse it. Do not place a live call.",
  },
  {
    name: "create_after_hours_receptionist",
    title: "Create an after-hours receptionist",
    description:
      "Create a confirmed private BotBound draft that answers after hours, captures ZIP and urgency, and never quotes prices.",
  },
  {
    name: "refine_draft_boundaries",
    title: "Refine draft boundaries",
    description:
      "Update a saved BotBound draft so it stays warm, never quotes a price, avoids medical advice, and only hands off when a BotBound handoff path is configured.",
  },
  {
    name: "inspect_workspace_status",
    title: "Inspect workspace status",
    description:
      "Ask for a privacy-minimized BotBound workspace summary: agents, assigned numbers, recent activity, and whether text and email are connected.",
  },
  {
    name: "rehearse_agent_reply",
    title: "Rehearse an agent reply",
    description:
      "Trigger a private text rehearsal of a saved BotBound agent with a hypothetical customer line. Do not place a live call.",
  },
  {
    name: "coach_agent_training",
    title: "Coach agent training",
    description:
      "Read the coaching brief for a BotBound agent, then add a confirmed Training fact or operating rule that lands in BotBound.",
  },
] as const;

const MCP_PROMPT_MESSAGES: Record<(typeof MCP_PROMPTS)[number]["name"], string> = {
  create_first_voice_agent: `Help me create a BotBound account if I do not have one, then build my first Bot in this chat.

Workflow:
1. If tools require Connect, wait for me to finish OAuth. New users sign up and return to consent.
2. Call list_wireline_agents once. If the workspace is empty, this is a first-agent session.
3. Ask what the agent should handle: receptionist, scheduler, sales, or support.
4. Summarize identity, goal, rules, prohibited topics, and escalation. Call create_agent_draft only after I explicitly confirm.
5. Privately rehearse with run_private_agent_turn or start_private_voice_simulation.
6. Point me to open_in_wireline_url for a number and launch. Do not place a live call or claim a customer was contacted.`,
  create_after_hours_receptionist: `Create a confirmed private BotBound draft that answers after hours, captures ZIP and urgency, and never quotes prices.

Summarize the proposed identity, goal, rules, and boundaries first. Call create_agent_draft only after I confirm. Then offer a private rehearsal. Do not place a live call.`,
  refine_draft_boundaries: `Update a saved BotBound draft so it stays warm, never quotes a price, avoids medical advice, and only hands off when a BotBound handoff path is configured.

Summarize the changes, then call update_agent_draft only after I confirm. Do not launch the agent.`,
  inspect_workspace_status: `Ask for a privacy-minimized BotBound workspace summary: agents, assigned numbers, recent activity, and whether text and email are connected.

Use get_wireline_workspace_summary. Never ask for or repeat customer identities, transcripts, recordings, or phone numbers.`,
  rehearse_agent_reply: `Trigger a private text rehearsal of a saved BotBound agent with a hypothetical customer line.

Ask me for the line if I have not given one. Call run_private_agent_turn only after I confirm. State that this is not a live call.`,
  coach_agent_training: `Read the coaching brief for a BotBound agent, then add a confirmed Training fact or operating rule that lands in BotBound.

Use get_agent_coaching_brief first. If train_wireline_agent says the Apps toggle is off, send me to BotBound Apps. Do not invent a workaround or claim a live call happened.`,
};

function inputFromArgs(args: Record<string, unknown>): AgentCustomizationInput {
  return {
    agent_name: args.agent_name,
    business_name: args.business_name,
    role: args.role,
    tone: args.tone,
    primary_goal: args.primary_goal,
    success_criteria: args.success_criteria,
    rules: args.rules,
    prohibited_topics: args.prohibited_topics,
    allowed_actions: args.allowed_actions,
    escalation_policy: args.escalation_policy,
    knowledge_summary: args.knowledge_summary,
  };
}

router.post("/mcp", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : null;
  const id = body?.id ?? null;
  const method = text(body?.method, 128);
  const params =
    body?.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : {};
  const principal = await principalFromRequest(req).catch((error) => {
    log.warn("ChatGPT account MCP token lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  const negotiatedVersion = applyMcpTransportHeaders(req, res, method, params);

  try {
    if (method === "initialize") {
      return jsonRpc(res, id, {
        protocolVersion: negotiatedVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: { name: MCP_SERVER_NAME, title: MCP_SERVER_TITLE, version: MCP_SERVER_VERSION },
        instructions:
          "BotBound is the system of record. Cursor, ChatGPT, and Claude help a new user create a BotBound account and build their first Bot here. They are not a voice SDK for a git repo. Confirm every create, update, rehearsal, and Training write. Training writes also require the Apps toggle. Never claim a live call, SMS, email, number attachment, or launch happened here. After the first draft, point the user to open_in_wireline_url for numbers and launch.",
      });
    }
    if (method === "ping") return jsonRpc(res, id, {});
    if (isMcpNotificationMethod(method)) return res.status(202).end();
    if (method === "tools/list") return jsonRpc(res, id, { tools: toolDefinitions() });
    if (method === "prompts/list") return jsonRpc(res, id, { prompts: MCP_PROMPTS });
    if (method === "prompts/get") {
      const name = text(params.name, 128);
      const prompt = MCP_PROMPTS.find((item) => item.name === name);
      if (!prompt) return jsonRpcError(res, id, -32602, "Unknown prompt.");
      return jsonRpc(res, id, {
        description: prompt.description,
        messages: [
          {
            role: "user",
            content: { type: "text", text: MCP_PROMPT_MESSAGES[prompt.name] },
          },
        ],
      });
    }
    if (method === "resources/list")
      return jsonRpc(res, id, {
        resources: [
          {
            uri: CHATGPT_ACCOUNT_WIDGET_URI,
            name: "BotBound agent draft",
            mimeType: "text/html;profile=mcp-app",
            description:
              "Connected BotBound agent draft with private voice simulation and a workspace handoff.",
          },
        ],
      });
    if (method === "resources/read") {
      const requestedUri = text(params.uri);
      if (requestedUri !== CHATGPT_ACCOUNT_WIDGET_URI && requestedUri !== CHATGPT_MCP_RESOURCE_URI)
        return jsonRpcError(res, id, -32002, "Resource not found.");
      return jsonRpc(res, id, {
        contents: [
          {
            uri: requestedUri,
            mimeType: "text/html;profile=mcp-app",
            text: buildAccountBoundWidgetHtml(),
            _meta: resourceMeta(req),
          },
        ],
      });
    }
    if (method !== "tools/call") return jsonRpcError(res, id, -32601, "Method not found.");

    const name = text(params.name, 128);
    const args =
      params.arguments && typeof params.arguments === "object"
        ? (params.arguments as Record<string, unknown>)
        : {};

    if (name === "create_agent_draft") {
      const authed = requireScope(principal, "agents.write");
      assertDraftConfirmation(args.confirmed);
      await assertMcpDraftWriteRateLimit(authed.userId);
      const view = await createAgentDraft(authed, inputFromArgs(args), authed.draftSource);
      const structured = toStructuredDraft(
        view as Awaited<ReturnType<typeof getAgentDraft>>["view"],
        req,
      );
      return jsonRpc(res, id, {
        content: [
          { type: "text", text: `${view.name} is saved as an unlaunched BotBound agent draft.` },
        ],
        structuredContent: structured,
        _meta: { agent_id: view.id },
      });
    }

    if (name === "get_agent_draft") {
      const authed = requireScope(principal, "agents.read");
      const draft = await getAgentDraft(authed, text(args.agent_id, 256));
      const structured = toStructuredDraft(draft.view, req);
      return jsonRpc(res, id, {
        content: [
          { type: "text", text: `${draft.view.name} is an unlaunched BotBound agent draft.` },
        ],
        structuredContent: structured,
        _meta: { agent_id: draft.view.id },
      });
    }

    if (name === "update_agent_draft") {
      const authed = requireScope(principal, "agents.write");
      assertDraftConfirmation(args.confirmed);
      await assertMcpDraftWriteRateLimit(authed.userId);
      const view = await updateAgentDraft(authed, text(args.agent_id, 256), inputFromArgs(args));
      const structured = toStructuredDraft(
        view as Awaited<ReturnType<typeof getAgentDraft>>["view"],
        req,
      );
      return jsonRpc(res, id, {
        content: [
          { type: "text", text: `${view.name} was updated in the connected BotBound workspace.` },
        ],
        structuredContent: structured,
        _meta: { agent_id: view.id },
      });
    }

    if (name === "start_private_voice_simulation") {
      const authed = requireScope(principal, "demo.voice");
      assertRehearsalConfirmation(args.confirmed);
      const draft = await getAgentDraft(authed, text(args.agent_id, 256));
      await assertLiveExternalActionAllowed(authed.userId, "chatgpt_private_voice_simulation");
      if (isLaunchHardBlocked()) {
        throw new AppError(
          503,
          "LAUNCH_NOT_READY",
          "Private voice simulation is temporarily paused while BotBound restores launch readiness.",
        );
      }
      const limit = await rateLimit(`chatgpt-private-simulation:${authed.userId}`, {
        bucket: "chatgpt-private-simulation",
        windowMs: 60 * 60 * 1000,
        max: 8,
        failClosedOnError: true,
      });
      if (!limit.allowed)
        throw AppError.tooManyRequests(
          "The private voice simulation limit has been reached. Continue testing from BotBound.",
        );
      // Every server-managed call charges vendor-metered realtime audio on the
      // platform key, so this tool must draw from the same daily simulation-minute
      // quota the web sandbox charges — the hourly limiter alone allowed 8
      // calls/hour all day, 64× the web path's daily ceiling. Fail closed on
      // tracker outage for the same reason the web path does.
      // Tenant-scoped like this file's other tenant writes: the quota-usage
      // insert is RLS-protected, and the WITH CHECK backstop should hold here
      // exactly as it does on the web path (authenticateUser scopes it there).
      const quota = await tenantStore
        .run(authed.userId, () =>
          quotaTracker.checkAndIncrement(authed.userId, "simulation_minutes_daily", 5),
        )
        .catch((err: unknown) => {
          log.error("chatgpt simulation quota tracker unavailable, refusing call", {
            userId: authed.userId,
            error: err instanceof Error ? err.message : String(err),
          });
          throw AppError.fromHttpStatus(
            503,
            "Live simulation is briefly unavailable. Try again shortly.",
          );
        });
      if (!quota.allowed)
        throw AppError.tooManyRequests(
          "Today's live-simulation minutes are used. They reset at midnight UTC, continue testing from BotBound.",
        );
      if (!quota.persisted) {
        // Read-only fallback decision: the increment was not durably
        // recorded, so an allowance here would be an unmetered vendor call.
        log.error("chatgpt simulation quota increment not durable, refusing call", {
          userId: authed.userId,
        });
        throw AppError.fromHttpStatus(
          503,
          "Live simulation is briefly unavailable. Try again shortly.",
        );
      }
      // Reserve against a freshly locked tenant budget before the provider.
      // The prior post-hoc insert let concurrent MCP calls cross the hard cap
      // and made accounting outages invisible until after OpenAI had charged.
      const spendDecision = await tenantStore.run(authed.userId, () =>
        reservePlatformCostRecord({
          userId: authed.userId,
          action: "voice.realtime.session",
          provider: "openai",
          model: OPENAI_REALTIME_DEFAULT_MODEL,
          costUsd: platformCostReserveUsd("openai_realtime_session"),
          requestMeta: { surface: "chatgpt_simulation" },
        }),
      );
      if (!spendDecision.reserved) {
        await tenantStore
          .run(authed.userId, () =>
            quotaTracker.releaseUsage(
              authed.userId,
              "simulation_minutes_daily",
              5,
              quota.period_key,
            ),
          )
          .catch((error: unknown) =>
            log.error("chatgpt simulation quota refund failed after spend refusal", {
              userId: authed.userId,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        if (spendDecision.reason === "cap_reached") {
          throw new AppError(
            402,
            "SPEND_CAP_REACHED",
            "The plan-funded private rehearsal allowance is used for this period. Continue from BotBound billing.",
            {
              period: spendDecision.period,
              month_to_date_usd: spendDecision.monthToDateUsd,
              monthly_limit_usd: spendDecision.monthlyLimitUsd,
            },
          );
        }
        throw new AppError(
          503,
          "SPEND_GUARD_UNAVAILABLE",
          "Live simulation is briefly unavailable. Try again shortly.",
        );
      }

      let session: Awaited<ReturnType<typeof createOpenAIRealtimeSimulationCall>>;
      try {
        session = await createOpenAIRealtimeSimulationCall({
          userId: authed.userId,
          sdp: text(args.offer_sdp, 60_000),
          agentName: draft.view.name,
          instructions: draft.runtimeInstructions,
          voice: draft.voiceId,
          tools: [],
          toolChoice: "none",
          apiKeyPurpose: "chatgpt_demo",
        });
      } catch (error) {
        // Retain both conservative reserves only when a provider call may
        // exist. Definitive pre-call failures and confirmed emergency hangups
        // can safely return the allowance.
        if (shouldRetainRealtimeReservation(error)) {
          await markPlatformCostReservationAmbiguous(spendDecision.reservation);
        } else {
          await tenantStore.run(authed.userId, async () => {
            const cleanup = await Promise.allSettled([
              releasePlatformCostReservation(spendDecision.reservation),
              quotaTracker.releaseUsage(
                authed.userId,
                "simulation_minutes_daily",
                5,
                quota.period_key,
              ),
            ]);
            if (cleanup.some((result) => result.status === "rejected")) {
              log.error("chatgpt simulation reservation cleanup was incomplete", {
                userId: authed.userId,
              });
            }
          });
        }
        throw error;
      }
      await commitPlatformCostReservation(spendDecision.reservation);
      const greeting = `Hi, this is ${draft.view.name}. How can I help?`;
      return jsonRpc(res, id, {
        content: [{ type: "text", text: "Private voice simulation ready." }],
        structuredContent: { status: "ready", agent_id: draft.view.id },
        _meta: mcpVoiceSimulationMeta({
          session,
          agentId: draft.view.id,
          greeting,
        }),
      });
    }

    if (name === "list_wireline_agents") {
      const authed = requireScope(principal, "agents.read");
      const agents = await tenantStore.run(authed.userId, async () => {
        const rows = await drizzle
          .select({
            id: schema.agents.id,
            name: schema.agents.name,
            markKey: schema.agents.markKey,
            role: schema.agents.role,
            channel: schema.agents.channel,
          })
          .from(schema.agents)
          .where(sql`${schema.agents.userId} = ${authed.userId}::uuid`)
          .orderBy(asc(schema.agents.createdAt), asc(schema.agents.id))
          .limit(BOT_MARK_IDENTITY_CAPACITY);
        return rows.map((agent) => ({
          id: agent.id,
          name: agent.name,
          mark_key: agent.markKey,
          role: agent.role || "assistant",
          channel: agent.channel || "voice",
        }));
      });
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text: agents.length
              ? `Found ${agents.length} BotBound agent${agents.length === 1 ? "" : "s"}.`
              : "No BotBound agents yet.",
          },
        ],
        structuredContent: { agents },
        _meta: { agents },
      });
    }

    if (name === "get_wireline_workspace_summary") {
      const authed = requireScope(principal, "agents.read");
      const summary = await tenantStore.run(authed.userId, async () => {
        const result = (await drizzle.execute(sql`
          SELECT
            (SELECT count(*)::int FROM wireline_agents WHERE user_id = ${authed.userId}::uuid) AS agent_count,
            (SELECT count(*)::int FROM wireline_phone_numbers WHERE user_id = ${authed.userId}::uuid) AS assigned_phone_number_count,
            (SELECT count(*)::int FROM wireline_call_logs WHERE user_id = ${authed.userId}::uuid AND created_at >= now() - interval '30 days') AS calls_last_30_days,
            (SELECT count(*)::int FROM wireline_sms_threads WHERE user_id = ${authed.userId}::uuid AND last_message_at >= now() - interval '30 days') AS text_threads_last_30_days,
            (SELECT count(*)::int FROM wireline_email_threads WHERE user_id = ${authed.userId}::uuid AND last_message_at >= now() - interval '30 days') AS email_threads_last_30_days,
            (SELECT coalesce(sum(unread_count), 0)::int FROM wireline_sms_threads WHERE user_id = ${authed.userId}::uuid) AS unread_text_count,
            (SELECT count(*)::int FROM wireline_email_threads WHERE user_id = ${authed.userId}::uuid AND read = false) AS unread_email_count,
            coalesce((SELECT activated_at IS NOT NULL FROM wireline_settings WHERE user_id = ${authed.userId}::uuid LIMIT 1), false) AS activated,
            coalesce((SELECT subscription_status FROM wireline_settings WHERE user_id = ${authed.userId}::uuid LIMIT 1), 'inactive') AS subscription_status,
            coalesce((SELECT twilio_messaging_enabled FROM wireline_settings WHERE user_id = ${authed.userId}::uuid LIMIT 1), false) AS texting_configured,
            EXISTS (SELECT 1 FROM wireline_email_accounts WHERE user_id = ${authed.userId}::uuid) AS email_connected,
            (
              SELECT max(activity_at)
              FROM (
                SELECT max(created_at) AS activity_at FROM wireline_call_logs WHERE user_id = ${authed.userId}::uuid
                UNION ALL
                SELECT max(last_message_at) AS activity_at FROM wireline_sms_threads WHERE user_id = ${authed.userId}::uuid
                UNION ALL
                SELECT max(last_message_at) AS activity_at FROM wireline_email_threads WHERE user_id = ${authed.userId}::uuid
              ) recent_activity
            ) AS latest_activity_at
        `)) as unknown as {
          rows?: Array<{
            agent_count: number | string;
            assigned_phone_number_count: number | string;
            calls_last_30_days: number | string;
            text_threads_last_30_days: number | string;
            email_threads_last_30_days: number | string;
            unread_text_count: number | string;
            unread_email_count: number | string;
            activated: boolean;
            subscription_status: string | null;
            texting_configured: boolean;
            email_connected: boolean;
            latest_activity_at: Date | string | null;
          }>;
        };
        const row = result.rows?.[0];
        return {
          agent_count: Number(row?.agent_count ?? 0),
          assigned_phone_number_count: Number(row?.assigned_phone_number_count ?? 0),
          calls_last_30_days: Number(row?.calls_last_30_days ?? 0),
          text_threads_last_30_days: Number(row?.text_threads_last_30_days ?? 0),
          email_threads_last_30_days: Number(row?.email_threads_last_30_days ?? 0),
          unread_text_count: Number(row?.unread_text_count ?? 0),
          unread_email_count: Number(row?.unread_email_count ?? 0),
          activated: row?.activated === true,
          subscription_status: text(row?.subscription_status, 80) || "inactive",
          texting_configured: row?.texting_configured === true,
          email_connected: row?.email_connected === true,
          latest_activity_at: isoDateOrEmpty(row?.latest_activity_at),
          open_in_wireline_url: `${issuer(req)}/studio`,
        };
      });
      const recentTotal =
        summary.calls_last_30_days +
        summary.text_threads_last_30_days +
        summary.email_threads_last_30_days;
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text: `BotBound workspace: ${summary.agent_count} agent${summary.agent_count === 1 ? "" : "s"}, ${summary.assigned_phone_number_count} assigned number${summary.assigned_phone_number_count === 1 ? "" : "s"}, and ${recentTotal} call, text, or email thread${recentTotal === 1 ? "" : "s"} in the last 30 days.`,
          },
        ],
        structuredContent: summary,
        _meta: { open_in_wireline_url: summary.open_in_wireline_url },
      });
    }

    if (name === "get_wireline_agent_status") {
      const authed = requireScope(principal, "agents.read");
      const agentId = text(args.agent_id, 256);
      const status = await tenantStore.run(authed.userId, async () => {
        const [agent] = await drizzle
          .select({
            id: schema.agents.id,
            name: schema.agents.name,
            role: schema.agents.role,
            channel: schema.agents.channel,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, authed.userId)))
          .limit(1);
        if (!agent) throw AppError.notFound("BotBound agent not found.");
        const [line] = await drizzle
          .select({ id: schema.phoneNumbers.id })
          .from(schema.phoneNumbers)
          .where(
            and(
              eq(schema.phoneNumbers.agentId, agent.id),
              eq(schema.phoneNumbers.userId, authed.userId),
            ),
          )
          .limit(1);
        const onPhoneNetwork = Boolean(line);
        const origin = issuer(req);
        const encoded = encodeURIComponent(agent.id);
        return {
          agent_id: agent.id,
          agent_name: agent.name,
          role: agent.role || "assistant",
          channel: agent.channel || "voice",
          on_phone_network: onPhoneNetwork,
          next_step: onPhoneNetwork
            ? "This agent is on the phone network. Open its BotBound Workspace to operate live work. You can still run a private rehearsal from this client."
            : "This agent is still a private draft. Open BotBound Connections to attach a number and launch. You can privately rehearse it from this client.",
          open_in_wireline_url: `${origin}/studio?agent=${encoded}`,
          training_url: `${origin}/knowledge?agent=${encoded}`,
          wire_url: `${origin}/connections?agent=${encoded}`,
        };
      });
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text: `${status.agent_name}: ${status.next_step}`,
          },
        ],
        structuredContent: status,
        _meta: { agent_id: status.agent_id, open_in_wireline_url: status.open_in_wireline_url },
      });
    }

    if (name === "run_private_agent_turn") {
      const authed = requireScope(principal, "demo.voice");
      assertRehearsalConfirmation(args.confirmed);
      const customerMessage = text(args.customer_message, 4000);
      if (!customerMessage) {
        throw AppError.fromHttpStatus(
          400,
          "Provide a hypothetical customer line for this private rehearsal.",
        );
      }
      if (isLaunchHardBlocked()) {
        throw new AppError(
          503,
          "LAUNCH_NOT_READY",
          "Private rehearsal is temporarily paused while BotBound restores launch readiness.",
        );
      }
      if (!isRuntimeAvailable()) {
        throw AppError.fromHttpStatus(
          503,
          "Private rehearsal is briefly unavailable. Try again shortly.",
        );
      }
      const limit = await rateLimit(`mcp-private-rehearsal:${authed.userId}`, {
        bucket: "mcp-private-rehearsal",
        windowMs: 60 * 60 * 1000,
        max: 20,
        failClosedOnError: true,
      });
      if (!limit.allowed) {
        throw AppError.tooManyRequests(
          "The private rehearsal limit has been reached. Continue testing from BotBound.",
        );
      }
      let capExceeded = false;
      try {
        capExceeded = await tenantStore.run(authed.userId, () =>
          isHardSpendCapExceeded(authed.userId),
        );
      } catch (error) {
        log.error("mcp private rehearsal spend guard unavailable", {
          userId: authed.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new AppError(
          503,
          "SPEND_GUARD_UNAVAILABLE",
          "Private rehearsal is briefly unavailable. Try again shortly.",
        );
      }
      if (capExceeded) {
        throw new AppError(
          402,
          "SPEND_CAP_REACHED",
          "The plan-funded rehearsal allowance is used for this period. Continue from BotBound billing.",
        );
      }
      const turn = await tenantStore.run(authed.userId, () =>
        runPrivateAgentTestTurn({
          userId: authed.userId,
          agentId: text(args.agent_id, 256),
          customerMessage,
        }),
      );
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text: `${turn.agent_name} (private rehearsal, not a live call): ${turn.reply}`,
          },
        ],
        structuredContent: { ...turn, live_call: false as const },
        _meta: { agent_id: turn.agent_id, live_call: false },
      });
    }

    if (name === "get_agent_coaching_brief") {
      const authed = requireScope(principal, "agents.read");
      const brief = await tenantStore.run(authed.userId, () =>
        getAgentCoachingBrief(authed.userId, text(args.agent_id, 256)),
      );
      const openInBotBoundUrl = `${issuer(req)}/knowledge?agent=${encodeURIComponent(brief.agent_id)}`;
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text: `${brief.agent_name}: ${brief.training_fact_count} Training fact${brief.training_fact_count === 1 ? "" : "s"}, ${brief.operating_rule_count} operating rule${brief.operating_rule_count === 1 ? "" : "s"}. ${brief.next_step}`,
          },
        ],
        structuredContent: { ...brief, open_in_wireline_url: openInBotBoundUrl },
        _meta: { agent_id: brief.agent_id, open_in_wireline_url: openInBotBoundUrl },
      });
    }

    if (name === "train_wireline_agent") {
      const authed = requireScope(principal, "agents.write");
      assertTrainingConfirmation(args.confirmed);
      const kind = text(args.kind, 16);
      if (kind !== "fact" && kind !== "rule") {
        throw AppError.fromHttpStatus(400, "kind must be fact or rule.");
      }
      await assertMcpDraftWriteRateLimit(authed.userId);
      const allowed = await tenantStore.run(authed.userId, () =>
        readMcpCoachingWritesEnabled(authed.userId),
      );
      if (!allowed) {
        throw AppError.fromHttpStatus(
          403,
          "Enable connected-app Training writes in BotBound Apps before a fact or rule can land in Training.",
        );
      }
      const saved = await tenantStore.run(authed.userId, () =>
        addAgentTrainingItem({
          userId: authed.userId,
          agentId: text(args.agent_id, 256),
          kind,
          content: text(args.content, kind === "fact" ? 4000 : 2000),
        }),
      );
      const openInBotBoundUrl = `${issuer(req)}/knowledge?agent=${encodeURIComponent(saved.agent_id)}`;
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text:
              kind === "fact"
                ? `Saved a Training fact for this agent in BotBound.`
                : `Saved an operating rule for this agent in BotBound.`,
          },
        ],
        structuredContent: {
          ...saved,
          landed_in_wireline: true as const,
          open_in_wireline_url: openInBotBoundUrl,
        },
        _meta: { agent_id: saved.agent_id, open_in_wireline_url: openInBotBoundUrl },
      });
    }

    return jsonRpcError(res, id, -32601, "Tool not found.");
  } catch (error) {
    if (error instanceof McpAuthorizationError) {
      const status = error.oauthError === "insufficient_scope" ? 403 : 401;
      const challenge = mcpOAuthChallenge(
        `${issuer(req)}/.well-known/oauth-protected-resource`,
        error.requiredScope,
        "Connect a BotBound account to continue.",
        error.oauthError,
      );
      res.setHeader("WWW-Authenticate", challenge);
      return jsonRpcError(res, id, -32001, "Connect a BotBound account to continue.", status, {
        required_scope: error.requiredScope,
        oauth_error: error.oauthError,
        _meta: { "mcp/www_authenticate": [challenge] },
      });
    }
    if (error instanceof AppError) {
      // Tool-execution failures surface as isError results so the model can
      // read the message and correct course; protocol failures stay errors.
      if (method === "tools/call") return jsonRpc(res, id, mcpToolErrorResult(error.message));
      return jsonRpcError(res, id, -32000, error.message, error.status);
    }
    log.error("ChatGPT account-bound MCP request failed", {
      method,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonRpcError(res, id, -32603, "BotBound could not complete that request.", 500);
  }
});

export default router;
