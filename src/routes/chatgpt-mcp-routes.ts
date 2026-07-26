import express, { type Request } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { verifyInternalJwt } from "../lib/auth-utils";
import { MCP_SCOPES, type McpScope } from "../lib/chatgpt-mcp";
import { requireInternalJwtSecret } from "../lib/internal-jwt-secret";
import {
  clientDisplayName,
  isDynamicClientId,
  newDynamicClientId,
  oauthErrorCode,
  validateDynamicClientRegistration,
} from "../lib/mcp-client-registry";
import {
  assertMcpTokenEndpointRateLimit,
  backfillMcpOAuthResourceBindings,
  hashMcpOAuthToken,
  mcpIssuer,
  mcpResourceUrl,
  pruneExpiredMcpOAuthRows,
  revokeMcpAccessTokensForClient,
} from "../lib/mcp-oauth-security";
import { rateLimit } from "../lib/rate-limit";
import { drizzle, fetchWithTimeout, log } from "../lib/server-context";
import { getSessionTokenFromRequest } from "../lib/session-cookie";
import * as schema from "../db/schema";

const router = express.Router();
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const CLIENT_METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scopes: McpScope[];
  resource: string;
};
type ClientMetadata = { clientId: string; redirectUris: string[] };

let schemaReady: Promise<void> | null = null;
const clientMetadataCache = new Map<string, { value: ClientMetadata; expiresAt: number }>();
const dynamicClientCache = new Map<string, { value: ClientMetadata; expiresAt: number }>();

function issuer(req?: Request): string {
  return mcpIssuer(req);
}

function mcpResource(req?: Request): string {
  return mcpResourceUrl(req);
}

function commaSet(value: string | undefined): Set<string> {
  return new Set(
    (value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function tokenHash(value: string): string {
  return hashMcpOAuthToken(value);
}

function publicId(): string {
  return randomBytes(32).toString("base64url");
}

function text(value: unknown, max = 2048): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseScopes(value: unknown): McpScope[] {
  const requested = typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
  const allowed = new Set<string>(MCP_SCOPES);
  return [...new Set(requested.filter((scope): scope is McpScope => allowed.has(scope)))];
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ||
      character,
  );
}

function isChatGptClientMetadataUrl(clientId: string): URL | null {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return null;
    if (!/^\/oauth\/.+\/client\.json$/.test(url.pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

function isChatGptRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      url.pathname.startsWith("/connector/oauth/")
    );
  } catch {
    return false;
  }
}

async function fetchChatGptClientMetadata(clientId: string): Promise<ClientMetadata | null> {
  const cached = clientMetadataCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const url = isChatGptClientMetadataUrl(clientId);
  if (!url) return null;
  try {
    const response = await fetchWithTimeout(
      url.toString(),
      { headers: { Accept: "application/json" }, redirect: "error" },
      8_000,
    );
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      return null;
    const payload = (await response.json()) as { redirect_uris?: unknown };
    const redirectUris = Array.isArray(payload.redirect_uris)
      ? payload.redirect_uris.filter(
          (value): value is string => typeof value === "string" && isChatGptRedirectUri(value),
        )
      : [];
    if (!redirectUris.length) return null;
    const value = { clientId, redirectUris };
    clientMetadataCache.set(clientId, {
      value,
      expiresAt: Date.now() + CLIENT_METADATA_CACHE_TTL_MS,
    });
    return value;
  } catch (error) {
    log.warn("ChatGPT OAuth client metadata lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function fetchDynamicClient(clientId: string): Promise<ClientMetadata | null> {
  if (!isDynamicClientId(clientId)) return null;
  const cached = dynamicClientCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  await ensureMcpSchema();
  const result = (await drizzle.execute(
    sql`SELECT redirect_uris FROM wireline_mcp_oauth_clients WHERE client_id = ${clientId} LIMIT 1`,
  )) as unknown as { rows?: Array<{ redirect_uris: unknown }> };
  const raw = result.rows?.[0]?.redirect_uris;
  const redirectUris = Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === "string")
    : [];
  if (!redirectUris.length) return null;
  const value = { clientId, redirectUris };
  dynamicClientCache.set(clientId, { value, expiresAt: Date.now() + CLIENT_METADATA_CACHE_TTL_MS });
  return value;
}

async function validateOAuthClient(clientId: string, redirectUri: string): Promise<boolean> {
  // Legacy pre-registered clients remain supported for controlled internal use.
  const configuredClients = commaSet(process.env.MCP_OAUTH_ALLOWED_CLIENT_IDS);
  const configuredRedirects = commaSet(process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS);
  if (configuredClients.has(clientId) && configuredRedirects.has(redirectUri)) return true;

  // Claude connectors register through RFC 7591 dynamic client registration,
  // which pins their callback set to Anthropic-operated hosts at registration.
  const dynamicClient = await fetchDynamicClient(clientId);
  if (dynamicClient) return dynamicClient.redirectUris.includes(redirectUri);

  // ChatGPT's standard Apps SDK path uses a Client ID Metadata Document (CIMD).
  // The metadata URL is the client_id and declares the exact callback URI.
  const metadata = await fetchChatGptClientMetadata(clientId);
  return Boolean(metadata?.redirectUris.includes(redirectUri));
}

async function validateAuthorizationRequest(
  source: Record<string, unknown>,
  req?: Request,
): Promise<AuthorizationRequest> {
  const responseType = text(source.response_type, 32);
  const clientId = text(source.client_id, 2048);
  const redirectUri = text(source.redirect_uri, 2048);
  const state =
    typeof source.state === "string" && source.state.length <= 2048 ? source.state : null;
  const codeChallenge = text(source.code_challenge, 256);
  const method = text(source.code_challenge_method, 32);
  const resource = text(source.resource, 2048);
  if (responseType !== "code" || !clientId || !redirectUri || !codeChallenge || method !== "S256") {
    throw AppError.fromHttpStatus(400, "Invalid OAuth authorization request.");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    throw AppError.fromHttpStatus(400, "Wireline requires OAuth PKCE with S256.");
  }
  if (resource !== mcpResource(req)) {
    throw AppError.fromHttpStatus(
      400,
      "The OAuth resource does not match Wireline's MCP endpoint.",
    );
  }
  // Absent scope means "server default" in OAuth; Claude omits it. A scope
  // parameter that names no known Wireline permission is still rejected.
  const scopes = source.scope === undefined ? [...MCP_SCOPES] : parseScopes(source.scope);
  if (!scopes.length)
    throw AppError.fromHttpStatus(400, "Choose at least one Wireline permission.");
  if (!(await validateOAuthClient(clientId, redirectUri))) {
    throw AppError.fromHttpStatus(
      400,
      "This OAuth client or redirect address is not registered for Wireline.",
    );
  }
  return { clientId, redirectUri, state, codeChallenge, scopes, resource };
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
    resource: request.resource,
  })
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");
  const scopeList = request.scopes
    .map((scope) => `<li>${escapeHtml(scope.replace(".", " "))}</li>`)
    .join("");
  const client = escapeHtml(clientDisplayName(request.redirectUri));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Connect Wireline</title><link rel="stylesheet" href="/static-legal.css" /></head><body class="oauth-consent"><main class="card"><div class="eyebrow">Wireline account connection</div><h1>Connect Wireline to ${client}</h1><p>Signed in as <strong>${escapeHtml(user.email)}</strong>. ${client} will be able to:</p><ul>${scopeList}</ul><p class="muted">Wireline will not place calls, send messages, connect phone numbers, or launch an agent without a separate explicit confirmation.</p><form method="post" action="/mcp/oauth/authorize">${hidden}<button type="submit">Allow ${client} to use Wireline</button></form></main></body></html>`;
}

async function ensureMcpSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await drizzle.execute(
        sql`CREATE TABLE IF NOT EXISTS wireline_mcp_oauth_codes (code_hash text PRIMARY KEY, user_id uuid NOT NULL, client_id text NOT NULL, redirect_uri text NOT NULL, scope text NOT NULL, code_challenge text NOT NULL, resource text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await drizzle.execute(
        sql`CREATE TABLE IF NOT EXISTS wireline_mcp_access_tokens (token_hash text PRIMARY KEY, user_id uuid NOT NULL, email text NOT NULL, client_id text NOT NULL, scope text NOT NULL, resource text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await drizzle.execute(
        sql`CREATE TABLE IF NOT EXISTS wireline_mcp_refresh_tokens (token_hash text PRIMARY KEY, user_id uuid NOT NULL, email text NOT NULL, client_id text NOT NULL, scope text NOT NULL, resource text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await drizzle.execute(
        sql`CREATE TABLE IF NOT EXISTS wireline_mcp_oauth_clients (client_id text PRIMARY KEY, client_name text NOT NULL, redirect_uris jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await drizzle.execute(
        sql`ALTER TABLE wireline_mcp_oauth_codes ADD COLUMN IF NOT EXISTS resource text`,
      );
      await drizzle.execute(
        sql`ALTER TABLE wireline_mcp_access_tokens ADD COLUMN IF NOT EXISTS resource text`,
      );
      await drizzle.execute(
        sql`ALTER TABLE wireline_mcp_refresh_tokens ADD COLUMN IF NOT EXISTS resource text`,
      );
      await drizzle.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires ON wireline_mcp_access_tokens (expires_at)`,
      );
      await drizzle.execute(
        sql`CREATE INDEX IF NOT EXISTS idx_mcp_refresh_tokens_expires ON wireline_mcp_refresh_tokens (expires_at)`,
      );
      await drizzle.execute(
        sql`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON wireline_mcp_oauth_codes, wireline_mcp_access_tokens, wireline_mcp_refresh_tokens, wireline_mcp_oauth_clients FROM anon; END IF; IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON wireline_mcp_oauth_codes, wireline_mcp_access_tokens, wireline_mcp_refresh_tokens, wireline_mcp_oauth_clients FROM authenticated; END IF; END $$`,
      );
      await drizzle.execute(sql`
        DO $$
        DECLARE
          mcp_table text;
        BEGIN
          FOREACH mcp_table IN ARRAY ARRAY[
            'wireline_mcp_oauth_codes',
            'wireline_mcp_access_tokens',
            'wireline_mcp_refresh_tokens',
            'wireline_mcp_oauth_clients'
          ] LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', mcp_table);
            EXECUTE format('DROP POLICY IF EXISTS deny_direct_api_access ON public.%I', mcp_table);

            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
               AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
              EXECUTE format(
                'CREATE POLICY deny_direct_api_access ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
                mcp_table
              );
            END IF;
          END LOOP;
        END $$;
      `);
      // Match migrations 0104 + 0115 — a runtime CREATE TABLE IF NOT EXISTS on a
      // fresh environment must not leave wireline_server without grants or a
      // permissive policy (tenant-context queries run as SET LOCAL ROLE
      // wireline_server and would otherwise default-deny to zero rows, silently
      // breaking the GDPR purge of these tables).
      await drizzle.execute(sql`
        DO $$
        DECLARE
          mcp_table text;
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wireline_server') THEN
            RETURN;
          END IF;

          FOREACH mcp_table IN ARRAY ARRAY[
            'wireline_mcp_oauth_codes',
            'wireline_mcp_access_tokens',
            'wireline_mcp_refresh_tokens'
          ] LOOP
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO wireline_server', mcp_table);
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', mcp_table);
            EXECUTE format(
              'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO wireline_server USING (user_id = (SELECT public.wireline_current_user_id())) WITH CHECK (user_id = (SELECT public.wireline_current_user_id()))',
              mcp_table
            );
          END LOOP;

          EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wireline_mcp_oauth_clients TO wireline_server';
          EXECUTE 'DROP POLICY IF EXISTS wireline_server_access ON public.wireline_mcp_oauth_clients';
          EXECUTE 'CREATE POLICY wireline_server_access ON public.wireline_mcp_oauth_clients FOR ALL TO wireline_server USING (true) WITH CHECK (true)';
        END $$;
      `);
      const resource = mcpResourceUrl();
      const backfilled = await backfillMcpOAuthResourceBindings(resource);
      if (backfilled > 0) {
        log.info("MCP OAuth resource backfill applied", { rows: backfilled, resource });
      }
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

async function issueTokens(input: {
  userId: string;
  email: string;
  clientId: string;
  scopes: McpScope[];
  resource: string;
}) {
  await ensureMcpSchema();
  await revokeMcpAccessTokensForClient(input.userId, input.clientId);
  // Awaited so the serverless invocation cannot freeze before the deletes
  // land; failures only warn because issuance must not depend on cleanup.
  await pruneExpiredMcpOAuthRows().catch((error) => {
    log.warn("MCP OAuth expired-row prune failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const accessToken = `wlmcp_${publicId()}`;
  const refreshToken = `wlmcp_r_${publicId()}`;
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO wireline_mcp_access_tokens (token_hash, user_id, email, client_id, scope, resource, expires_at) VALUES (${tokenHash(accessToken)}, ${input.userId}::uuid, ${input.email}, ${input.clientId}, ${input.scopes.join(" ")}, ${input.resource}, ${accessExpiresAt})`,
    );
    await tx.execute(
      sql`INSERT INTO wireline_mcp_refresh_tokens (token_hash, user_id, email, client_id, scope, resource, expires_at) VALUES (${tokenHash(refreshToken)}, ${input.userId}::uuid, ${input.email}, ${input.clientId}, ${input.scopes.join(" ")}, ${input.resource}, ${refreshExpiresAt})`,
    );
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: input.scopes.join(" "),
    resource: input.resource,
  };
}

router.get(
  [
    "/.well-known/oauth-protected-resource",
    // RFC 9728 inserts the well-known segment before the resource path, so
    // clients resolving the "/mcp" resource request the suffixed form.
    "/.well-known/oauth-protected-resource/mcp",
    "/mcp/.well-known/oauth-protected-resource",
  ],
  (req, res) => {
    const base = issuer(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      resource: mcpResource(req),
      authorization_servers: [base],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ["header"],
    });
  },
);

router.get(
  ["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/mcp"],
  (req, res) => {
    const base = issuer(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      issuer: base,
      authorization_endpoint: `${base}/mcp/oauth/authorize`,
      token_endpoint: `${base}/mcp/oauth/token`,
      registration_endpoint: `${base}/mcp/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      scopes_supported: MCP_SCOPES,
      token_endpoint_auth_methods_supported: ["none"],
    });
  },
);

router.post("/mcp/oauth/register", express.json({ limit: "64kb" }), async (req, res, next) => {
  try {
    const limit = await rateLimit(`mcp-register:${req.ip || "anon"}`, {
      bucket: "mcp-client-register",
      windowMs: 60 * 60 * 1000,
      max: 10,
      failClosedOnError: true,
    });
    if (!limit.allowed)
      return res.status(429).json({
        code: "MCP_REGISTER_RATE_LIMITED",
        error: "invalid_client_metadata",
        error_description: "Too many registration attempts. Try again later.",
      });
    const registration = validateDynamicClientRegistration(req.body);
    await ensureMcpSchema();
    const clientId = newDynamicClientId();
    await drizzle.execute(
      sql`INSERT INTO wireline_mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES (${clientId}, ${registration.clientName}, ${JSON.stringify(registration.redirectUris)}::jsonb)`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: registration.clientName,
      redirect_uris: registration.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: MCP_SCOPES.join(" "),
    });
  } catch (error) {
    const code = oauthErrorCode(error);
    if (code && error instanceof AppError) {
      return res.status(400).json({ code, error: code, error_description: error.message });
    }
    next(error);
  }
});

router.get("/mcp/oauth/authorize", async (req, res, next) => {
  try {
    const request = await validateAuthorizationRequest(req.query as Record<string, unknown>, req);
    const principal = await sessionPrincipal(req);
    if (!principal)
      return res.redirect(`/signin?redirect=${encodeURIComponent(req.originalUrl || req.url)}`);
    res.setHeader("Cache-Control", "no-store");
    return res.type("html").send(oauthConsentPage(request, { email: principal.email }));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/mcp/oauth/authorize",
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      const request = await validateAuthorizationRequest(req.body as Record<string, unknown>, req);
      const principal = await sessionPrincipal(req);
      if (!principal)
        return res.redirect(`/signin?redirect=${encodeURIComponent(req.originalUrl || req.url)}`);
      await ensureMcpSchema();
      const code = publicId();
      await drizzle.execute(
        sql`INSERT INTO wireline_mcp_oauth_codes (code_hash, user_id, client_id, redirect_uri, scope, code_challenge, resource, expires_at) VALUES (${tokenHash(code)}, ${principal.userId}::uuid, ${request.clientId}, ${request.redirectUri}, ${request.scopes.join(" ")}, ${request.codeChallenge}, ${request.resource}, ${new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS)})`,
      );
      const destination = new URL(request.redirectUri);
      destination.searchParams.set("code", code);
      if (request.state) destination.searchParams.set("state", request.state);
      return res.redirect(destination.toString());
    } catch (error) {
      next(error);
    }
  },
);

router.post("/mcp/oauth/token", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    await assertMcpTokenEndpointRateLimit(req.ip || "anon");
    await ensureMcpSchema();
    const grantType = text(req.body?.grant_type, 64);
    const clientId = text(req.body?.client_id, 2048);
    const resource = text(req.body?.resource, 2048);
    if (!clientId || resource !== mcpResource(req))
      return res.status(400).json({ error: "invalid_request", code: "INVALID_REQUEST" });
    if (grantType === "authorization_code") {
      const code = text(req.body?.code, 1024);
      const redirectUri = text(req.body?.redirect_uri, 2048);
      const verifier = text(req.body?.code_verifier, 1024);
      if (!code || !redirectUri || !verifier)
        return res.status(400).json({ error: "invalid_request", code: "INVALID_REQUEST" });
      const deleted = (await drizzle.execute(
        sql`DELETE FROM wireline_mcp_oauth_codes WHERE code_hash = ${tokenHash(code)} RETURNING user_id, client_id, redirect_uri, scope, code_challenge, resource, expires_at`,
      )) as unknown as {
        rows?: Array<{
          user_id: string;
          client_id: string;
          redirect_uri: string;
          scope: string;
          code_challenge: string;
          resource: string | null;
          expires_at: Date | string;
        }>;
      };
      const record = deleted.rows?.[0];
      if (
        !record ||
        new Date(record.expires_at).getTime() <= Date.now() ||
        record.client_id !== clientId ||
        record.redirect_uri !== redirectUri ||
        record.resource !== resource
      )
        return res.status(400).json({ error: "invalid_grant", code: "INVALID_GRANT" });
      const actual = Buffer.from(createHash("sha256").update(verifier, "utf8").digest("base64url"));
      const expected = Buffer.from(record.code_challenge);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        return res.status(400).json({ error: "invalid_grant", code: "INVALID_GRANT" });
      const user = await drizzle
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, record.user_id))
        .limit(1);
      if (!user[0]) return res.status(400).json({ error: "invalid_grant", code: "INVALID_GRANT" });
      return res.json(
        await issueTokens({
          userId: record.user_id,
          email: user[0].email,
          clientId,
          scopes: parseScopes(record.scope),
          resource,
        }),
      );
    }
    if (grantType === "refresh_token") {
      const refreshToken = text(req.body?.refresh_token, 1024);
      if (!refreshToken)
        return res.status(400).json({ error: "invalid_request", code: "INVALID_REQUEST" });
      const deleted = (await drizzle.execute(
        sql`DELETE FROM wireline_mcp_refresh_tokens WHERE token_hash = ${tokenHash(refreshToken)} RETURNING user_id, email, client_id, scope, resource, expires_at`,
      )) as unknown as {
        rows?: Array<{
          user_id: string;
          email: string;
          client_id: string;
          scope: string;
          resource: string | null;
          expires_at: Date | string;
        }>;
      };
      const record = deleted.rows?.[0];
      if (
        !record ||
        record.client_id !== clientId ||
        record.resource !== resource ||
        new Date(record.expires_at).getTime() <= Date.now()
      )
        return res.status(400).json({ error: "invalid_grant", code: "INVALID_GRANT" });
      return res.json(
        await issueTokens({
          userId: record.user_id,
          email: record.email,
          clientId,
          scopes: parseScopes(record.scope),
          resource,
        }),
      );
    }
    return res
      .status(400)
      .json({ error: "unsupported_grant_type", code: "UNSUPPORTED_GRANT_TYPE" });
  } catch (error) {
    next(error);
  }
});

// session-termination requests with 405 rather than an opaque 404.
router.get("/mcp", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).json({
    code: "MCP_METHOD_NOT_ALLOWED",
    error: "method_not_allowed",
    detail: "Send MCP requests as POST /mcp.",
  });
});
router.delete("/mcp", (_req, res) => {
  res.setHeader("Allow", "POST");
  res.status(405).json({
    code: "MCP_METHOD_NOT_ALLOWED",
    error: "method_not_allowed",
    detail: "Sessions are stateless.",
  });
});

export default router;
