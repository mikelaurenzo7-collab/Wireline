import express, { type Request, type Response } from "express";
import { sql } from "drizzle-orm";
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
import { mcpDraftSourceForClient } from "../lib/mcp-client-registry";
import {
  assertMcpDraftWriteRateLimit,
  hashMcpOAuthToken,
  isMcpResourceBound,
  mcpIssuer,
} from "../lib/mcp-oauth-security";
import {
  applyMcpTransportHeaders,
  isMcpNotificationMethod,
  mcpToolErrorResult,
} from "../lib/mcp-transport";
import { drizzle, log, quotaTracker, tenantStore } from "../lib/server-context";
import { rateLimit } from "../lib/rate-limit";
import { createOpenAIRealtimeClientSecret } from "../lib/voice/openai-realtime-service";
import * as schema from "../db/schema";

const router = express.Router();

type McpPrincipal = AgentDraftPrincipal & {
  scopes: McpScope[];
  draftSource: "chatgpt_mcp" | "claude_mcp" | "cursor_mcp";
};

class McpAuthorizationError extends Error {
  constructor(readonly requiredScope: McpScope) {
    super("Connect a Wireline account to continue.");
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
  if (!principal || !principal.scopes.includes(scope)) throw new McpAuthorizationError(scope);
  return principal;
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
    ...(visibility ? { ui: { resourceUri: CHATGPT_ACCOUNT_WIDGET_URI, visibility } } : {}),
    securitySchemes,
  });
  const customizationProperties = {
    agent_name: { type: "string", description: "The name the agent uses with callers." },
    business_name: {
      type: "string",
      description: "The business or personal brand the agent represents.",
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
        "Actions the account holder wants the agent to support when configured in Wireline.",
    },
    escalation_policy: {
      type: "string",
      enum: ["take_message", "handoff_when_configured", "never"],
    },
    knowledge_summary: {
      type: "string",
      description:
        "Key business knowledge the agent should use until fuller knowledge sources are added in Wireline.",
    },
  };

  return [
    {
      name: "create_agent_draft",
      title: "Create a Wireline agent draft",
      description:
        "Creates a persistent, private, unlaunched Wireline agent draft in the connected user’s workspace. Before calling, summarize the proposed identity, goal, rules, and action boundaries, then obtain explicit confirmation. This does not attach a phone number, send a message, place a call, or launch the agent.",
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
      title: "Get a Wireline agent draft",
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
      title: "Update a Wireline agent draft",
      description:
        "Updates the connected user’s private unlaunched Wireline draft. Before calling, summarize the configuration changes and obtain explicit confirmation. It does not launch the agent or activate an external action.",
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
        "Creates a short-lived, tool-free voice simulation for one connected user’s Wireline draft. The simulation cannot make calls, send messages, access business systems, or complete an external action.",
      inputSchema: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
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
      title: "List Wireline agents",
      description:
        "Lists the connected user’s Wireline agents and drafts. Use this for status or configuration questions about that user’s workspace.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: {
        type: "object",
        properties: {
          agents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                role: { type: "string" },
                channel: { type: "string" },
              },
              required: ["id", "name", "role", "channel"],
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
      title: "Get Wireline workspace summary",
      description:
        "Returns aggregate operational status for the connected Wireline workspace: agents, assigned phone numbers, recent call/text/email activity, unread counts, channel connection state, activation, and subscription status. It never returns customer identities, message bodies, transcripts, recordings, credentials, or provider secrets.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: workspaceSummaryOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      securitySchemes: [{ type: "oauth2", scopes: ["agents.read"] }],
      _meta: toolMeta([{ type: "oauth2", scopes: ["agents.read"] }]),
    },
  ];
}

function resourceMeta(req: Request) {
  return {
    ui: {
      prefersBorder: true,
      domain: issuer(req),
      csp: { connectDomains: ["https://api.openai.com"], resourceDomains: [] },
    },
    "openai/widgetDescription":
      "Shows a connected Wireline agent draft, private voice simulation, aggregate workspace status, and a secure path to continue configuration in Wireline.",
  };
}

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
        },
        serverInfo: { name: "wireline-chatgpt", version: "2.2.0" },
        instructions:
          "Wireline requires a connected Wireline account. Use it to create and refine a real private agent draft, list agents, and inspect aggregate operational status in the user’s workspace. Before a create or update operation, summarize identity, goal, rules, knowledge, action boundaries, and escalation policy; only write after the user explicitly confirms. Private voice simulations are tool-free. Never claim an agent is live, has a number, or completed an external action unless Wireline confirms it.",
      });
    }
    if (method === "ping") return jsonRpc(res, id, {});
    if (isMcpNotificationMethod(method)) return res.status(202).end();
    if (method === "tools/list") return jsonRpc(res, id, { tools: toolDefinitions() });
    if (method === "resources/list")
      return jsonRpc(res, id, {
        resources: [
          {
            uri: CHATGPT_ACCOUNT_WIDGET_URI,
            name: "Wireline agent draft",
            mimeType: "text/html;profile=mcp-app",
            description:
              "Connected Wireline agent draft with private voice simulation and a workspace handoff.",
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
      assertDraftConfirmation(args.confirmed);
      const authed = requireScope(principal, "agents.write");
      await assertMcpDraftWriteRateLimit(authed.userId);
      const view = await createAgentDraft(authed, inputFromArgs(args), authed.draftSource);
      const structured = toStructuredDraft(
        view as Awaited<ReturnType<typeof getAgentDraft>>["view"],
        req,
      );
      return jsonRpc(res, id, {
        content: [
          { type: "text", text: `${view.name} is saved as an unlaunched Wireline agent draft.` },
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
          { type: "text", text: `${draft.view.name} is an unlaunched Wireline agent draft.` },
        ],
        structuredContent: structured,
        _meta: { agent_id: draft.view.id },
      });
    }

    if (name === "update_agent_draft") {
      assertDraftConfirmation(args.confirmed);
      const authed = requireScope(principal, "agents.write");
      await assertMcpDraftWriteRateLimit(authed.userId);
      const view = await updateAgentDraft(authed, text(args.agent_id, 256), inputFromArgs(args));
      const structured = toStructuredDraft(
        view as Awaited<ReturnType<typeof getAgentDraft>>["view"],
        req,
      );
      return jsonRpc(res, id, {
        content: [
          { type: "text", text: `${view.name} was updated in the connected Wireline workspace.` },
        ],
        structuredContent: structured,
        _meta: { agent_id: view.id },
      });
    }

    if (name === "start_private_voice_simulation") {
      const authed = requireScope(principal, "demo.voice");
      const draft = await getAgentDraft(authed, text(args.agent_id, 256));
      const limit = await rateLimit(`chatgpt-private-simulation:${authed.userId}`, {
        bucket: "chatgpt-private-simulation",
        windowMs: 60 * 60 * 1000,
        max: 8,
        failClosedOnError: true,
      });
      if (!limit.allowed)
        throw AppError.tooManyRequests(
          "The private voice simulation limit has been reached. Continue testing from Wireline.",
        );
      // Every mint charges a vendor-metered realtime secret on the platform
      // key, so this tool must draw from the same daily simulation-minute
      // quota the web sandbox charges — the hourly limiter alone allowed 8
      // mints/hour all day, 64× the web path's daily ceiling. Fail closed on
      // tracker outage for the same reason the web mint does.
      const quota = await quotaTracker
        .checkAndIncrement(authed.userId, "simulation_minutes_daily", 5)
        .catch((err: unknown) => {
          log.error("chatgpt simulation quota tracker unavailable — refusing mint", {
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
          "Today's live-simulation minutes are used. They reset at midnight UTC — continue testing from Wireline.",
        );
      const session = await createOpenAIRealtimeClientSecret({
        userId: authed.userId,
        agentName: draft.view.name,
        instructions: draft.runtimeInstructions,
        tools: [],
        toolChoice: "none",
        apiKeyPurpose: "chatgpt_demo",
      });
      return jsonRpc(res, id, {
        content: [{ type: "text", text: "Private voice simulation ready." }],
        structuredContent: { status: "ready", agent_id: draft.view.id },
        _meta: {
          realtime_session: {
            ...session,
            greeting: `Hi, this is ${draft.view.name}. How can I help?`,
          },
          agent_id: draft.view.id,
        },
      });
    }

    if (name === "list_wireline_agents") {
      const authed = requireScope(principal, "agents.read");
      const agents = await tenantStore.run(authed.userId, async () => {
        const rows = await drizzle
          .select({
            id: schema.agents.id,
            name: schema.agents.name,
            role: schema.agents.role,
            channel: schema.agents.channel,
          })
          .from(schema.agents)
          .where(sql`${schema.agents.userId} = ${authed.userId}::uuid`)
          .limit(20);
        return rows.map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role || "assistant",
          channel: agent.channel || "voice",
        }));
      });
      return jsonRpc(res, id, {
        content: [
          {
            type: "text",
            text: agents.length
              ? `Found ${agents.length} Wireline agent${agents.length === 1 ? "" : "s"}.`
              : "No Wireline agents yet.",
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
          open_in_wireline_url: `${issuer(req)}/overview`,
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
            text: `Wireline workspace: ${summary.agent_count} agent${summary.agent_count === 1 ? "" : "s"}, ${summary.assigned_phone_number_count} assigned number${summary.assigned_phone_number_count === 1 ? "" : "s"}, and ${recentTotal} call, text, or email thread${recentTotal === 1 ? "" : "s"} in the last 30 days.`,
          },
        ],
        structuredContent: summary,
        _meta: { open_in_wireline_url: summary.open_in_wireline_url },
      });
    }

    return jsonRpcError(res, id, -32601, "Tool not found.");
  } catch (error) {
    if (error instanceof McpAuthorizationError) {
      const challenge = `Bearer resource_metadata="${issuer(req)}/.well-known/oauth-protected-resource", error="insufficient_scope", scope="${error.requiredScope}"`;
      res.setHeader("WWW-Authenticate", challenge);
      return jsonRpcError(res, id, -32001, "Connect a Wireline account to continue.", 401, {
        required_scope: error.requiredScope,
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
    return jsonRpcError(res, id, -32603, "Wireline could not complete that request.", 500);
  }
});

export default router;
