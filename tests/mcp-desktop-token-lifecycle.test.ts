import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { execute: h.execute, transaction: h.transaction },
  tenantStore: { run: vi.fn() },
  fetchWithTimeout: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../src/lib/auth-utils", () => ({ verifyInternalJwt: vi.fn() }));
import router from "../src/routes/chatgpt-mcp-routes";
import { hashMcpOAuthToken } from "../src/lib/mcp-oauth-security";

const dialect = new PgDialect();
const resource = "https://botbound.app/mcp";
const clientId = "botbound-desktop";
const verifier = "owner-approved-pkce-verifier";
const redirect = "http://127.0.0.1:49511/callback";
type Grant = {
  user_id: string;
  email: string;
  client_id: string;
  scope: string;
  resource: string;
  expires_at: Date;
  redirect_uri?: string;
  code_challenge?: string;
};
let access: Map<string, Grant>;
let refresh: Map<string, Grant>;
let codes: Map<string, Grant>;
let mutations: string[];

function grant(owner = "owner-1", client = clientId): Grant {
  return {
    user_id: owner,
    email: `${owner}@example.test`,
    client_id: client,
    scope: "agents.read computer.plan",
    resource,
    expires_at: new Date(Date.now() + 3_600_000),
  };
}
function matchHolder(params: unknown[]): Grant[] {
  const [hash, client, audience] = params;
  return [access.get(String(hash)), refresh.get(String(hash))].filter((row): row is Grant =>
    Boolean(
      row &&
      row.client_id === client &&
      row.resource === audience &&
      row.expires_at.getTime() > Date.now(),
    ),
  );
}
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://botbound.app");
  vi.stubEnv("MCP_OAUTH_TOKEN_PEPPER", "test-pepper-at-least-thirty-two-characters");
  access = new Map();
  refresh = new Map();
  codes = new Map();
  mutations = [];
  h.execute
    .mockReset()
    .mockImplementation(async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const query = dialect.sqlToQuery(statement);
      const text = query.sql.replace(/\s+/g, " ").trim();
      const params = query.params;
      const table = text.includes("wireline_mcp_access_tokens")
        ? access
        : text.includes("wireline_mcp_refresh_tokens")
          ? refresh
          : codes;
      if (text.endsWith("FOR UPDATE")) {
        const rows = text.includes(" UNION ")
          ? matchHolder(params)
          : [table.get(String(params[0]))].filter((row): row is Grant => Boolean(row));
        return { rows: [...new Set(rows.map((row) => row.user_id))].map((id) => ({ id })) };
      }
      if (text.startsWith("SELECT user_id"))
        return {
          rows: [...new Set(matchHolder(params).map((row) => row.user_id))].map((user_id) => ({
            user_id,
          })),
        };
      if (text.startsWith("SELECT email FROM wireline_users"))
        return { rows: [{ email: `${params[0]}@example.test` }] };
      if (text.startsWith("DELETE") && text.includes("expires_at < now()")) return { rows: [] };
      if (text.startsWith("DELETE")) {
        mutations.push(text);
        if (text.includes("RETURNING")) {
          const row = table.get(String(params[0]));
          table.delete(String(params[0]));
          return { rows: row ? [row] : [] };
        }
        for (const [hash, row] of table)
          if (
            row.user_id === params[0] &&
            row.client_id === params[1] &&
            (params.length === 2 || row.resource === params[2])
          )
            table.delete(hash);
      }
      if (text.startsWith("INSERT")) {
        mutations.push(text);
        const [hash, owner, email, client, scope, audience, expires] = params;
        table.set(String(hash), {
          user_id: String(owner),
          email: String(email),
          client_id: String(client),
          scope: String(scope),
          resource: String(audience),
          expires_at: expires as Date,
        });
      }
      // Schema maintenance is a no-op in this hermetic route harness; no real DB is loaded.
      return { rows: [], rowCount: 0 };
    });
  h.transaction.mockReset().mockImplementation(async (work) => work({ execute: h.execute }));
});
afterEach(() => vi.unstubAllEnvs());

async function call(path: string, body: Record<string, unknown>) {
  const handler = router.stack
    .find((layer) => layer.route?.path === path)!
    .route!.stack.at(-1)!.handle;
  const req = { body, ip: "127.0.0.1" };
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(status: number) {
      this.statusCode = status;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  const next = vi.fn();
  await handler(req as never, res as never, next);
  expect(next).not.toHaveBeenCalled();
  return res;
}
async function connect(code: string, owner = "owner-1", client = clientId) {
  codes.set(hashMcpOAuthToken(code), {
    ...grant(owner, client),
    redirect_uri: redirect,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  });
  const response = await call("/mcp/oauth/token", {
    grant_type: "authorization_code",
    code,
    client_id: client,
    redirect_uri: redirect,
    code_verifier: verifier,
    resource,
  });
  expect(response.statusCode).toBe(200);
  return response.body as { access_token: string; refresh_token: string; expires_in: number };
}

describe("desktop OAuth installation coexistence and standard revocation", () => {
  it("keeps two desktop installations authorized across code exchange and either installation's refresh", async () => {
    const first = await connect("first-code");
    const second = await connect("second-code");
    expect(access.has(hashMcpOAuthToken(first.access_token))).toBe(true);
    expect(access.has(hashMcpOAuthToken(second.access_token))).toBe(true);
    expect(first.expires_in).toBe(3600);
    const rotated = await call("/mcp/oauth/token", {
      grant_type: "refresh_token",
      client_id: clientId,
      resource,
      refresh_token: first.refresh_token,
    });
    expect(rotated.statusCode).toBe(200);
    expect(access.has(hashMcpOAuthToken(second.access_token))).toBe(true);
    expect(refresh.has(hashMcpOAuthToken(first.refresh_token))).toBe(false);
    expect(refresh.has(hashMcpOAuthToken(second.refresh_token))).toBe(true);
    const replay = await call("/mcp/oauth/token", {
      grant_type: "refresh_token",
      client_id: clientId,
      resource,
      refresh_token: first.refresh_token,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.body).toMatchObject({ error: "invalid_grant" });
  });

  it("preserves the existing access-token replacement behavior for non-desktop clients", async () => {
    const first = await connect("first-code", "owner-1", "legacy-client");
    const second = await connect("second-code", "owner-1", "legacy-client");
    expect(access.has(hashMcpOAuthToken(first.access_token))).toBe(false);
    expect(access.has(hashMcpOAuthToken(second.access_token))).toBe(true);
  });

  it.each([undefined, resource])(
    "revokes both desktop installations with canonical or omitted resource %s",
    async (audience) => {
      const first = await connect("first-code");
      await connect("second-code");
      const otherOwner = await connect("other-owner", "owner-2");
      const otherClient = await connect("other-client", "owner-1", "legacy-client");
      codes.set("pending-owner-code", grant());
      const response = await call("/mcp/oauth/revoke", {
        token: first.refresh_token,
        client_id: clientId,
        ...(audience === undefined ? {} : { resource: audience }),
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBeUndefined();
      expect([...access.keys()]).toEqual([
        hashMcpOAuthToken(otherOwner.access_token),
        hashMcpOAuthToken(otherClient.access_token),
      ]);
      expect([...refresh.keys()]).toEqual([
        hashMcpOAuthToken(otherOwner.refresh_token),
        hashMcpOAuthToken(otherClient.refresh_token),
      ]);
      expect(codes.has("pending-owner-code")).toBe(false);
    },
  );

  it.each(["https://evil.test/mcp", "", null, [resource]])(
    "rejects an explicit wrong/malformed resource without touching grants %j",
    async (audience) => {
      const first = await connect("first-code");
      mutations = [];
      const response = await call("/mcp/oauth/revoke", {
        token: first.refresh_token,
        client_id: clientId,
        resource: audience,
      });
      expect(response.statusCode).toBe(400);
      expect(mutations).toEqual([]);
      expect(refresh.has(hashMcpOAuthToken(first.refresh_token))).toBe(true);
    },
  );

  it("returns idempotent empty success for unknown or wrong-client tokens without changing grants", async () => {
    const first = await connect("first-code");
    mutations = [];
    for (const body of [
      { token: "unknown", client_id: clientId },
      { token: first.refresh_token, client_id: "wrong-client" },
    ]) {
      const response = await call("/mcp/oauth/revoke", body);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBeUndefined();
    }
    expect(mutations).toEqual([]);
    expect(refresh.has(hashMcpOAuthToken(first.refresh_token))).toBe(true);
  });

  it.each(["access_token", "refresh_token", "unrecognized_hint"])(
    "uses actual token binding rather than trusting the optional hint %s",
    async (hint) => {
      const first = await connect("first-code");
      const response = await call("/mcp/oauth/revoke", {
        token: first.access_token,
        client_id: clientId,
        token_type_hint: hint,
      });
      expect(response.statusCode).toBe(200);
      expect(access.size).toBe(0);
      expect(refresh.size).toBe(0);
    },
  );
});
