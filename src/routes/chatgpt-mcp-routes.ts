import express, { type Request, type Response } from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { getDefaultAgentTools } from "../lib/agent-capabilities";
import { resolveAgentEntitlement } from "../lib/agent-entitlements";
import { isOwnerEmail } from "../lib/auth-service";
import { verifyInternalJwt } from "../lib/auth-utils";
import {
  CHATGPT_MCP_RESOURCE_URI,
  buildChatGptWidgetHtml,
  buildDemoRealtimeInstructions,
  createDemoSpec,
  decodeDemoToken,
  encodeDemoToken,
  MCP_PROTOCOL_VERSION,
  MCP_SCOPES,
  type McpScope,
} from "../lib/chatgpt-mcp";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import { pickRotatedVoiceId } from "../data/voice-roster";
import { rateLimit } from "../lib/rate-limit";
import { drizzle, log, tenantStore } from "../lib/server-context";
import { getSessionTokenFromRequest } from "../lib/session-cookie";
import { createOpenAIRealtimeClientSecret } from "../lib/voice/openai-realtime-service";
import * as schema from "../db/schema";

const router = express.Router();
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const roleArchetypes: Record<string, string> = {
  sales: "Sales Representative",
  scheduler: "Personal Assistant",
  receptionist: "Receptionist",
  customer_service: "Customer Support",
};

type McpPrincipal = { userId: string; email: string; scopes: McpScope[] };
type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: McpScope[];
};

let schemaReady: Promise<void> | null = null;

function issuer(req?: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = req?.get("host");
  return host ? `https://${host}` : "https://trywireline.com";
}

function commaSet(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function tokenPepper(): string {
  const pepper = process.env.MCP_OAUTH_TOKEN_PEPPER?.trim();
  if (!pepper || pepper.length < 32) {
    throw AppError.fromHttpStatus(503, "ChatGPT account linking is not configured.");
  }
  return pepper;
}

function tokenHash(value: string): string {
  return createHmac("sha256", tokenPepper()).update(value, "utf8").digest("hex");
}

function publicId(): string {
  return randomBytes(32).toString("base64url");
}

function parseScopes(value: unknown): McpScope[] {
  const requested = typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
  const allowed = new Set<string>(MCP_SCOPES);
  const scopes = requested.filter((scope): scope is McpScope => allowed.has(scope));
  return [...new Set(scopes)];
}

function requireRegisteredClient(clientId: string, redirectUri: string) {
  const clientIds = commaSet(process.env.MCP_OAUTH_ALLOWED_CLIENT_IDS);
  const redirectUris = commaSet(process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS);
  if (!clientIds.size || !redirectUris.size) {
    throw AppError.fromHttpStatus(
      503,
      "ChatGPT account linking is not ready. Configure MCP_OAUTH_ALLOWED_CLIENT_IDS and MCP_OAUTH_ALLOWED_REDIRECT_URIS.",
    );
  }
  if (!clientIds.has(clientId) || !redirectUris.has(redirectUri)) {
    throw AppError.fromHttpStatus(400, "This OAuth client or redirect address is not registered for Wireline.");
  }
}

function validateAuthorizationRequest(source: Record<string, unknown>): AuthorizationRequest {
  const responseType = typeof source.response_type === "string" ? source.response_type : "";
  const clientId = typeof source.client_id === "string" ? source.client_id.trim() : "";
  const redirectUri = typeof source.redirect_uri === "string" ? source.redirect_uri.trim() : "";
  const state = typeof source.state === "string" && source.state.length <= 2048 ? source.state : null;
  const codeChallenge = typeof source.code_challenge === "string" ? source.code_challenge : "";
  const method = typeof source.code_challenge_method === "string" ? source.code_challenge_method : "";
  if (responseType !== "code" || !clientId || !redirectUri || !/^https:\/\//.test(redirectUri)) {
    throw AppError.fromHttpStatus(400, "Invalid OAuth authorization request.");
  }
  if (method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw AppError.fromHttpStatus(400, "Wireline requires OAuth PKCE with S256.");
  }
  const scopes = parseScopes(source.scope);
  if (!scopes.length) {
    throw AppError.fromHttpStatus(400, "Choose at least one Wireline permission.");
  }
  requireRegisteredClient(clientId, redirectUri);
  return { clientId, redirectUri, state, codeChallenge, scopes };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function oauthConsentPage(request: AuthorizationRequest, user: { email: string }): string {
  const hidden = Object.entries({
    response_type: "code",
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    state: request.state || "",
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    scope: request.scopes.join(" "),
  })
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`)
    .join("\n");
  const scopeList = request.scopes
    .map((scope) => `<li>${escapeHtml(scope.replace(".", " "))}</li>`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Connect Wireline</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8f9ff;color:#172033;margin:0;display:grid;min-height:100vh;place-items:center;padding:24px}.card{width:min(100%,480px);background:#fff;border:1px solid #e2e5ee;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(18,24,40,.08)}h1{margin:0 0 10px;font-size:25px}p,li{line-height:1.5;color:#516077}ul{padding-left:20px}button{width:100%;border:0;border-radius:10px;padding:12px 16px;background:#5d3fd3;color:#fff;font:600 15px inherit;cursor:pointer}.muted{font-size:13px;color:#718096}</style></head><body><main class="card"><div class="muted">Wireline account connection</div><h1>Connect Wireline to ChatGPT</h1><p>Signed in as <strong>${escapeHtml(user.email)}</strong>. ChatGPT will be able to:</p><ul>${scopeList}</ul><p class="muted">Wireline will not place calls, send messages, connect phone numbers, or launch an agent without a separate explicit confirmation.</p><form method="post" action="/mcp/oauth/authorize">${hidden}<button type="submit">Allow ChatGPT to use Wireline</button></form></main></body></html>`;
}

async function ensureMcpSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await drizzle.execute(sql`
        CREATE TABLE IF NOT EXISTS wireline_mcp_oauth_codes (
          code_hash text PRIMARY KEY,
          user_id uuid NOT NULL,
          client_id text NOT NULL,
          redirect_uri text NOT NULL,
          scope text NOT NULL,
          code_challenge text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await drizzle.execute(sql`
        CREATE TABLE IF NOT EXISTS wireline_mcp_access_tokens (
          token_hash text PRIMARY KEY,
          user_id uuid NOT NULL,
          email text NOT NULL,
          client_id text NOT NULL,
          scope text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await drizzle.execute(sql`
        CREATE TABLE IF NOT EXISTS wireline_mcp_refresh_tokens (
          token_hash text PRIMARY KEY,
          user_id uuid NOT NULL,
          email text NOT NULL,
          client_id text NOT NULL,
          scope text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await drizzle.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires ON wireline_mcp_access_tokens (expires_at)`);
      await drizzle.execute(sql`CREATE INDEX IF NOT EXISTS idx_mcp_refresh_tokens_expires ON wireline_mcp_refresh_tokens (expires_at)`);
      await drizzle.execute(sql`
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON wireline_mcp_oauth_codes, wireline_mcp_access_tokens, wireline_mcp_refresh_tokens FROM anon;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON wireline_mcp_oauth_codes, wireline_mcp_access_tokens, wireline_mcp_refresh_tokens FROM authenticated;
          END IF;
        END $$
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function sessionPrincipal(req: Request): Promise<{ userId: string; email: string } | null> {
  const token = getSessionTokenFromRequest(req);
  if (!token) return null;
  const payload = await verifyInternalJwt(token, requireInternalJwtSecret());
  if (!payload?.sub || !payload.email) return null;
  return { userId: payload.sub, email: payload.email };
}

async function issueTokens(input: { userId: string; email: string; clientId: string; scopes: McpScope[] }) {
  await ensureMcpSchema();
  const accessToken = `wlmcp_${publicId()}`;
  const refreshToken = `wlmcp_r_${publicId()}`;
  const now = Date.now();
  const accessExpiresAt = new Date(now + ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_MS);
  await drizzle.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO wireline_mcp_access_tokens (token_hash, user_id, email, client_id, scope, expires_at)
      VALUES (${tokenHash(accessToken)}, ${input.userId}::uuid, ${input.email}, ${input.clientId}, ${input.scopes.join(" ")}, ${accessExpiresAt})
    `);
    await tx.execute(sql`
      INSERT INTO wireline_mcp_refresh_tokens (token_hash, user_id, email, client_id, scope, expires_at)
      VALUES (${tokenHash(refreshToken)}, ${input.userId}::uuid, ${input.email}, ${input.clientId}, ${input.scopes.join(" ")}, ${refreshExpiresAt})
    `);
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: input.scopes.join(" "),
  };
}

async function mcpPrincipal(req: Request): Promise<McpPrincipal | null> {
  const authorization = req.get("authorization") || "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token || token.length > 1000) return null;
  await ensureMcpSchema();
  const result = (await drizzle.execute(sql`
    SELECT user_id, email, scope, expires_at
    FROM wireline_mcp_access_tokens
    WHERE token_hash = ${tokenHash(token)}
    LIMIT 1
  `)) as unknown as { rows?: Array<{ user_id: string; email: string; scope: string; expires_at: Date | string }> };
  const row = result.rows?.[0];
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const scopes = parseScopes(row.scope);
  return scopes.length ? { userId: row.user_id, email: row.email, scopes } : null;
}

class McpAuthorizationError extends Error {
  constructor(readonly requiredScope?: McpScope) {
    super("Connect a Wireline account to continue.");
  }
}

function requireScope(principal: McpPrincipal | null, scope: McpScope): McpPrincipal {
  if (!principal || !principal.scopes.includes(scope)) throw new McpAuthorizationError(scope);
  return principal;
}

function jsonRpc(res: Response, id: unknown, result: unknown, status = 200) {
  res.status(status).type("application/json").json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonRpcError(res: Response, id: unknown, code: number, message: string, status = 200, data?: unknown) {
  res.status(status).type("application/json").json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
}

function resourceMeta(req: Request) {
  return {
    ui: {
      prefersBorder: true,
      domain: issuer(req),
      csp: { connectDomains: ["https://api.openai.com"], resourceDomains: [] },
    },
    "openai/widgetDescription": "Shows a Wireline AI phone-agent preview with an optional live voice demo and a secure save-to-Wireline action.",
  };
}

function toolDefinitions(req: Request) {
  const widgetMeta = {
    ui: { resourceUri: CHATGPT_MCP_RESOURCE_URI },
    "openai/outputTemplate": CHATGPT_MCP_RESOURCE_URI,
    "openai/widgetAccessible": true,
  };
  return [
    {
      name: "start_agent_demo",
      title: "Build a Wireline agent preview",
      description: "Creates a temporary AI phone-agent preview from a business goal. Use this when a user wants to design, explore, or try a receptionist, scheduler, sales, or customer-service phone agent. No Wireline account is required for this preview.",
      inputSchema: {
        type: "object",
        properties: {
          business_name: { type: "string", description: "Business or personal brand the agent represents." },
          agent_name: { type: "string", description: "Optional name for the agent." },
          role: { type: "string", enum: ["receptionist", "scheduler", "sales", "customer_service"] },
          primary_goal: { type: "string", description: "The primary outcome the agent should drive." },
          tone: { type: "string", description: "Desired speaking style, such as warm and concise." },
        },
        required: ["business_name", "primary_goal"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: widgetMeta,
    },
    {
      name: "create_demo_voice_session",
      title: "Start a private live voice preview",
      description: "Creates a short, tool-free realtime voice session for the active Wireline agent preview. This is available only from the Wireline preview card and cannot place calls or access business data.",
      inputSchema: {
        type: "object",
        properties: { demo_token: { type: "string" } },
        required: ["demo_token"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: { ...widgetMeta, ui: { resourceUri: CHATGPT_MCP_RESOURCE_URI, visibility: ["app"] } },
    },
    {
      name: "save_demo_to_wireline",
      title: "Save the demo agent to Wireline",
      description: "Creates a durable, unlaunched Wireline agent draft from the current preview. Requires a connected Wireline account and explicit confirmation. The draft does not get a phone number or make calls.",
      inputSchema: {
        type: "object",
        properties: { demo_token: { type: "string" }, confirmed: { type: "boolean", description: "Must be true only after the user has confirmed they want to keep this draft." } },
        required: ["demo_token", "confirmed"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
      _meta: widgetMeta,
    },
    {
      name: "list_wireline_agents",
      title: "List Wireline agents",
      description: "Shows the connected user’s existing Wireline agent drafts and live agents. Use for status or configuration questions after the user connects Wireline.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: widgetMeta,
    },
  ];
}

async function saveDemo(principal: McpPrincipal, demoToken: unknown) {
  const spec = decodeDemoToken(demoToken);
  return tenantStore.run(principal.userId, async () => {
    const [{ count }] = await drizzle
      .select({ count: sql`count(*)` })
      .from(schema.agents)
      .where(eq(schema.agents.userId, principal.userId));
    const existing = Number(count || 0);
    const [setting] = await drizzle
      .select({
        planId: schema.subscriptions.plan,
        subscriptionStatus: schema.settings.subscriptionStatus,
        maxAgents: schema.settings.maxAgents,
        extraAgents: schema.settings.extraAgents,
      })
      .from(schema.settings)
      .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
      .where(eq(schema.settings.userId, principal.userId))
      .limit(1);
    const entitlement = resolveAgentEntitlement({
      isOwner: isOwnerEmail(principal.email),
      subscriptionStatus: setting?.subscriptionStatus,
      planId: setting?.planId,
      maxAgents: setting?.maxAgents,
      extraAgents: setting?.extraAgents,
    });
    if (entitlement.effectiveCap !== null && existing >= entitlement.effectiveCap) {
      throw AppError.fromHttpStatus(402, `Agent capacity limit reached. Your plan allows up to ${entitlement.effectiveCap} agents.`);
    }
    const id = `agent-${randomBytes(16).toString("hex")}`;
    await drizzle.insert(schema.agents).values({
      id,
      userId: principal.userId,
      name: spec.agentName,
      role: spec.role,
      channel: "voice",
      archetype: roleArchetypes[spec.role] || "Assistant",
      voiceId: pickRotatedVoiceId(existing),
      voiceProvider: "openai",
      enabledTools: getDefaultAgentTools(spec.role),
      firstMessage: `Hi, this is ${spec.agentName}. How can I help?`,
      isBusinessAgent: spec.businessName !== "Your business",
      businessVariables: { businessName: spec.businessName, primaryGoal: spec.primaryGoal, previewTone: spec.tone, source: "chatgpt_app" },
      systemPromptOverride: buildDemoRealtimeInstructions(spec),
    });
    return { id, spec };
  });
}

router.get("/.well-known/oauth-protected-resource", (req, res) => {
  const base = issuer(req);
  res.json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: MCP_SCOPES, bearer_methods_supported: ["header"] });
});

router.get("/mcp/.well-known/oauth-protected-resource", (req, res) => {
  const base = issuer(req);
  res.json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: MCP_SCOPES, bearer_methods_supported: ["header"] });
});

router.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = issuer(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/mcp/oauth/authorize`,
    token_endpoint: `${base}/mcp/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: MCP_SCOPES,
    token_endpoint_auth_methods_supported: ["none"],
  });
});

router.get("/mcp/oauth/authorize", async (req, res, next) => {
  try {
    const request = validateAuthorizationRequest(req.query as Record<string, unknown>);
    const principal = await sessionPrincipal(req);
    if (!principal) {
      const redirect = req.originalUrl || req.url;
      res.redirect(`/signin?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    res.type("html").send(oauthConsentPage(request, { email: principal.email }));
  } catch (error) {
    next(error);
  }
});

router.post("/mcp/oauth/authorize", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const request = validateAuthorizationRequest(req.body as Record<string, unknown>);
    const principal = await sessionPrincipal(req);
    if (!principal) {
      res.redirect(`/signin?redirect=${encodeURIComponent(req.originalUrl || req.url)}`);
      return;
    }
    await ensureMcpSchema();
    const code = publicId();
    await drizzle.execute(sql`
      INSERT INTO wireline_mcp_oauth_codes (code_hash, user_id, client_id, redirect_uri, scope, code_challenge, expires_at)
      VALUES (${tokenHash(code)}, ${principal.userId}::uuid, ${request.clientId}, ${request.redirectUri}, ${request.scopes.join(" ")}, ${request.codeChallenge}, ${new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS)})
    `);
    const destination = new URL(request.redirectUri);
    destination.searchParams.set("code", code);
    if (request.state) destination.searchParams.set("state", request.state);
    res.redirect(destination.toString());
  } catch (error) {
    next(error);
  }
});

router.post("/mcp/oauth/token", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    await ensureMcpSchema();
    const grantType = typeof req.body?.grant_type === "string" ? req.body.grant_type : "";
    const clientId = typeof req.body?.client_id === "string" ? req.body.client_id.trim() : "";
    if (!clientId) throw AppError.fromHttpStatus(400, "client_id is required.");
    if (grantType === "authorization_code") {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri.trim() : "";
      const verifier = typeof req.body?.code_verifier === "string" ? req.body.code_verifier : "";
      if (!code || !redirectUri || !verifier) throw AppError.fromHttpStatus(400, "code, redirect_uri, and code_verifier are required.");
      const deleted = (await drizzle.execute(sql`
        DELETE FROM wireline_mcp_oauth_codes
        WHERE code_hash = ${tokenHash(code)}
        RETURNING user_id, client_id, redirect_uri, scope, code_challenge, expires_at
      `)) as unknown as { rows?: Array<{ user_id: string; client_id: string; redirect_uri: string; scope: string; code_challenge: string; expires_at: Date | string }> };
      const record = deleted.rows?.[0];
      if (!record || new Date(record.expires_at).getTime() <= Date.now() || record.client_id !== clientId || record.redirect_uri !== redirectUri) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      const verifierChallenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
      const challengeA = Buffer.from(verifierChallenge);
      const challengeB = Buffer.from(record.code_challenge);
      if (challengeA.length !== challengeB.length || !timingSafeEqual(challengeA, challengeB)) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      const user = await drizzle.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, record.user_id)).limit(1);
      if (!user[0]) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      res.json(await issueTokens({ userId: record.user_id, email: user[0].email, clientId, scopes: parseScopes(record.scope) }));
      return;
    }
    if (grantType === "refresh_token") {
      const refreshToken = typeof req.body?.refresh_token === "string" ? req.body.refresh_token : "";
      if (!refreshToken) throw AppError.fromHttpStatus(400, "refresh_token is required.");
      const deleted = (await drizzle.execute(sql`
        DELETE FROM wireline_mcp_refresh_tokens
        WHERE token_hash = ${tokenHash(refreshToken)}
        RETURNING user_id, email, client_id, scope, expires_at
      `)) as unknown as { rows?: Array<{ user_id: string; email: string; client_id: string; scope: string; expires_at: Date | string }> };
      const record = deleted.rows?.[0];
      if (!record || record.client_id !== clientId || new Date(record.expires_at).getTime() <= Date.now()) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      res.json(await issueTokens({ userId: record.user_id, email: record.email, clientId, scopes: parseScopes(record.scope) }));
      return;
    }
    res.status(400).json({ error: "unsupported_grant_type" });
  } catch (error) {
    next(error);
  }
});

router.post("/mcp", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : null;
  const id = body?.id ?? null;
  const method = typeof body?.method === "string" ? body.method : "";
  const params = body?.params && typeof body.params === "object" ? body.params as Record<string, unknown> : {};
  const principal = await mcpPrincipal(req).catch((error) => {
    log.warn("ChatGPT MCP token lookup failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  res.setHeader("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
  res.setHeader("Mcp-Session-Id", req.get("mcp-session-id") || publicId());
  try {
    if (method === "initialize") {
      jsonRpc(res, id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: "wireline-chatgpt", version: "1.0.0" },
        instructions: "Use Wireline to create a private voice-agent preview first. Guests can explore and try live voice from the preview card. Require a connected Wireline account plus explicit confirmation before saving an agent draft. Never claim an agent is live, has a number, or can place calls unless Wireline confirms it.",
      });
      return;
    }
    if (method === "notifications/initialized") {
      res.status(202).end();
      return;
    }
    if (method === "tools/list") {
      jsonRpc(res, id, { tools: toolDefinitions(req) });
      return;
    }
    if (method === "resources/list") {
      jsonRpc(res, id, { resources: [{ uri: CHATGPT_MCP_RESOURCE_URI, name: "Wireline agent launch board", mimeType: "text/html;profile=mcp-app", description: "Compact Wireline agent preview, guest voice demo, and conversion controls." }] });
      return;
    }
    if (method === "resources/read") {
      const uri = typeof params.uri === "string" ? params.uri : "";
      if (uri !== CHATGPT_MCP_RESOURCE_URI) {
        jsonRpcError(res, id, -32002, "Resource not found.");
        return;
      }
      jsonRpc(res, id, { contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: buildChatGptWidgetHtml(), _meta: resourceMeta(req) }] });
      return;
    }
    if (method !== "tools/call") {
      jsonRpcError(res, id, -32601, "Method not found.");
      return;
    }
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
    if (name === "start_agent_demo") {
      const spec = createDemoSpec(args);
      const demoToken = encodeDemoToken(spec);
      jsonRpc(res, id, { content: [{ type: "text", text: `Wireline prepared ${spec.agentName}, a private preview for ${spec.businessName}.` }], structuredContent: { agent_name: spec.agentName, business_name: spec.businessName, role: spec.role, primary_goal: spec.primaryGoal, tone: spec.tone, demo_token: demoToken, next_step: "Try live voice from the Wireline card, then save the agent when you want to keep it." }, _meta: { demo_token: demoToken } });
      return;
    }
    if (name === "create_demo_voice_session") {
      const spec = decodeDemoToken(args.demo_token);
      const limit = await rateLimit(`chatgpt-demo:${req.ip || "anon"}`, { bucket: "chatgpt-demo-voice", windowMs: 60 * 60 * 1000, max: 3, failClosedOnError: true });
      if (!limit.allowed) throw AppError.tooManyRequests("The free live voice preview limit has been reached. Save the agent to Wireline to continue testing.");
      const session = await createOpenAIRealtimeClientSecret({ userId: `guest:${createHash("sha256").update(String(req.ip || "anon")).digest("hex").slice(0, 32)}`, agentName: spec.agentName, instructions: buildDemoRealtimeInstructions(spec), tools: [], toolChoice: "none" });
      jsonRpc(res, id, { content: [{ type: "text", text: "Private live voice preview ready." }], structuredContent: { status: "ready" }, _meta: { realtime_session: session } });
      return;
    }
    if (name === "save_demo_to_wireline") {
      if (args.confirmed !== true) throw AppError.fromHttpStatus(400, "Confirm that you want to save this Wireline agent draft before continuing.");
      const authed = requireScope(principal, "agents.write");
      const saved = await saveDemo(authed, args.demo_token);
      jsonRpc(res, id, { content: [{ type: "text", text: `${saved.spec.agentName} is saved as an unlaunched Wireline draft.` }], structuredContent: { agent_id: saved.id, agent_name: saved.spec.agentName, status: "draft", next_step: "Open Wireline to connect a verified test number, configure knowledge and escalation, then explicitly launch." }, _meta: {} });
      return;
    }
    if (name === "list_wireline_agents") {
      const authed = requireScope(principal, "agents.read");
      const agents = await tenantStore.run(authed.userId, () => import("../lib/agents-store").then(({ listAgentsForUser }) => listAgentsForUser(authed.userId)));
      const summary = agents.slice(0, 20).map((agent: { id: string; name: string; role?: string; channel?: string }) => ({ id: agent.id, name: agent.name, role: agent.role || "assistant", channel: agent.channel || "voice" }));
      jsonRpc(res, id, { content: [{ type: "text", text: summary.length ? `Found ${summary.length} Wireline agent${summary.length === 1 ? "" : "s"}.` : "No Wireline agents yet." }], structuredContent: { agents: summary }, _meta: { agents } });
      return;
    }
    jsonRpcError(res, id, -32601, "Tool not found.");
  } catch (error) {
    if (error instanceof McpAuthorizationError) {
      const base = issuer(req);
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="${error.requiredScope || "agents.read"}"`);
      jsonRpcError(res, id, -32001, "Connect a Wireline account to continue.", 401, { required_scope: error.requiredScope });
      return;
    }
    const appError = error instanceof AppError ? error : null;
    if (appError) {
      jsonRpcError(res, id, -32000, appError.message, appError.statusCode || 400);
      return;
    }
    log.error("ChatGPT MCP request failed", { method, error: error instanceof Error ? error.message : String(error) });
    jsonRpcError(res, id, -32603, "Wireline could not complete that request.", 500);
  }
});

export default router;
