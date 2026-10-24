import { createHash } from "node:crypto";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const RESOURCE = "https://botbound.app/mcp";
const CLIENT_ID = "lifecycle-test-client";
const REDIRECT_URI = "https://client.example/callback";
const NOW = Date.UTC(2030, 0, 2, 12);
const VERIFIER = "v".repeat(43);

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => Promise<unknown>>(),
  userExists: true,
  deletionStates: [] as Array<{ status: string; scheduledPurgeAt: Date | null }>,
  selectedTables: [] as string[],
  queryTenants: [] as Array<string | undefined>,
  tenantGetStore: () => undefined as string | undefined,
  statements: [] as string[],
  beforeTransaction: undefined as (() => void) | undefined,
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
  createDraft: vi.fn(),
  getDraft: vi.fn(),
  updateDraft: vi.fn(),
}));

vi.mock("express", () => {
  const router = () => ({
    post: (path: string, ...handlers: any[]) => h.handlers.set(`POST ${path}`, handlers.at(-1)),
    get: (path: string, ...handlers: any[]) => h.handlers.set(`GET ${path}`, handlers.at(-1)),
    delete: (path: string, ...handlers: any[]) => h.handlers.set(`DELETE ${path}`, handlers.at(-1)),
  });
  const express = { Router: router, json: vi.fn(), urlencoded: vi.fn() };
  return { default: express, Router: router };
});
vi.mock("../src/lib/server-context", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const tenantStore = new AsyncLocalStorage<string>();
  h.tenantGetStore = () => tenantStore.getStore();
  return {
    drizzle: { select: h.select, execute: h.execute, transaction: h.transaction },
    tenantStore,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    auditLogger: { logAuth: vi.fn() },
    quotaTracker: {},
  };
});
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("../src/lib/auth-utils", () => ({
  verifyInternalJwt: vi.fn(async () => ({
    sub: USER_ID,
    email: "old@example.test",
    iat: 1,
    exp: 9_999_999_999,
    session_version: 4,
  })),
}));
vi.mock("../src/lib/internal-jwt-secret", () => ({ requireInternalJwtSecret: () => "test-key" }));
vi.mock("../src/lib/session-generation", () => ({ isSessionGenerationActive: () => true }));
vi.mock("../src/lib/agent-draft-service", () => ({
  createAgentDraft: h.createDraft,
  getAgentDraft: h.getDraft,
  updateAgentDraft: h.updateDraft,
}));

import "../src/routes/chatgpt-mcp-account-routes";
import "../src/routes/chatgpt-mcp-routes";
import { resolveMcpAccount } from "../src/lib/mcp-oauth-security";
import { hasTerminalAccountDeletion } from "../src/middleware/auth";

const dialect = new PgDialect();
const terminalStates = [
  ["expired pending", { status: "pending", scheduledPurgeAt: new Date(NOW - 1) }],
  ["purging", { status: "purging", scheduledPurgeAt: new Date(NOW + 60_000) }],
  ["missing deadline", { status: "pending", scheduledPurgeAt: null }],
] as const;

function response() {
  const res = {
    statusCode: 200,
    body: undefined as any,
    redirectUrl: undefined as string | undefined,
    setHeader: vi.fn(),
    status: vi.fn(),
    type: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    redirect: vi.fn(),
  };
  res.status.mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.type.mockReturnValue(res);
  res.json.mockImplementation((body) => {
    res.body = body;
    return res;
  });
  res.send.mockImplementation((body) => {
    res.body = body;
    return res;
  });
  res.redirect.mockImplementation((url) => {
    res.redirectUrl = url;
    return res;
  });
  return res;
}

async function invoke(path: string, body: Record<string, unknown>) {
  const req = {
    body,
    query: body,
    ip: "203.0.113.1",
    originalUrl: path.slice(path.indexOf(" ") + 1),
    headers: { authorization: "Bearer test-session" },
    get: (name: string) => (name === "authorization" ? "Bearer test-access" : undefined),
  };
  const res = response();
  const next = vi.fn();
  await h.handlers.get(path)!(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return res;
}

function authorization() {
  return {
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    resource: RESOURCE,
    scope: "agents.read agents.write",
    code_challenge: createHash("sha256").update(VERIFIER).digest("base64url"),
    code_challenge_method: "S256",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("APP_URL", "https://botbound.app");
  vi.stubEnv("MCP_OAUTH_TOKEN_PEPPER", "synthetic-test-pepper-".repeat(3));
  vi.stubEnv("MCP_OAUTH_ALLOWED_CLIENT_IDS", CLIENT_ID);
  vi.stubEnv("MCP_OAUTH_ALLOWED_REDIRECT_URIS", REDIRECT_URI);
  h.userExists = true;
  h.deletionStates = [];
  h.beforeTransaction = undefined;
  h.selectedTables = [];
  h.queryTenants = [];
  h.statements = [];
  h.createDraft.mockReset();
  h.getDraft.mockReset();
  h.updateDraft.mockReset();
  h.select.mockReset().mockImplementation(() => {
    let table = "";
    const rows = () =>
      table === "wireline_users"
        ? h.userExists
          ? [{ id: USER_ID, email: "current@example.test", sessionVersion: 4 }]
          : []
        : table === "wireline_deletion_queue"
          ? h.deletionStates
          : [];
    const query: any = {
      from: vi.fn((source) => {
        table = getTableName(source);
        h.selectedTables.push(table);
        return query;
      }),
      where: vi.fn(() => query),
      orderBy: vi.fn(() => query),
      limit: vi.fn(() => Promise.resolve(rows())),
      then: (fulfilled: (value: unknown) => unknown, rejected?: (reason: unknown) => unknown) => {
        h.queryTenants.push(h.tenantGetStore());
        return Promise.resolve(rows()).then(fulfilled, rejected);
      },
    };
    return query;
  });
  h.execute.mockReset().mockImplementation(async (statement) => {
    const query = dialect.sqlToQuery(statement);
    const text = query.sql.replace(/\s+/g, " ").trim();
    h.statements.push(text);
    if (text.endsWith("FOR UPDATE")) return { rows: h.userExists ? [{ id: USER_ID }] : [] };
    if (text.includes("FROM wireline_mcp_access_tokens") && text.startsWith("SELECT")) {
      return {
        rows: [
          {
            user_id: USER_ID,
            email: "old@example.test",
            scope: "agents.read agents.write",
            resource: RESOURCE,
            client_id: CLIENT_ID,
            expires_at: new Date(NOW + 60_000),
          },
        ],
      };
    }
    if (text.startsWith("DELETE") && text.includes("RETURNING user_id")) {
      return {
        rows: [
          {
            user_id: USER_ID,
            email: "old@example.test",
            client_id: CLIENT_ID,
            resource: RESOURCE,
            scope: "agents.read agents.write",
            redirect_uri: REDIRECT_URI,
            code_challenge: authorization().code_challenge,
            expires_at: new Date(NOW + 60_000),
          },
        ],
      };
    }
    if (text.startsWith("SELECT email FROM wireline_users")) {
      return { rows: h.userExists ? [{ email: "current@example.test" }] : [] };
    }
    return { rows: [], rowCount: 0 };
  });
  h.transaction.mockReset().mockImplementation(async (work) => {
    h.beforeTransaction?.();
    return work({ select: h.select, execute: h.execute });
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("MCP terminal account lifecycle", () => {
  it("executes the lazy terminal-deletion query inside its tenant context", async () => {
    expect(h.tenantGetStore()).toBeUndefined();
    expect(await hasTerminalAccountDeletion(USER_ID)).toBe(false);
    expect(h.queryTenants).toEqual([USER_ID]);
    expect(h.tenantGetStore()).toBeUndefined();
  });

  it.each(terminalStates)(
    "rejects %s before account tool reads and draft writes",
    async (_name, state) => {
      h.deletionStates = [state];
      for (const name of ["list_botbound_agents", "get_agent_draft", "create_agent_draft"]) {
        const res = await invoke("POST /mcp", {
          id: 1,
          method: "tools/call",
          params: { name, arguments: { confirmed: true, agent_id: "draft-1" } },
        });
        expect(res.statusCode).toBe(401);
        expect(res.body.error.code).toBe(-32001);
      }
      expect(
        h.selectedTables.every((table) =>
          ["wireline_users", "wireline_deletion_queue"].includes(table),
        ),
      ).toBe(true);
      expect(h.statements.some((sql) => sql.includes("FROM wireline_mcp_oauth_clients"))).toBe(
        false,
      );
      expect(h.createDraft).not.toHaveBeenCalled();
      expect(h.getDraft).not.toHaveBeenCalled();
      expect(h.updateDraft).not.toHaveBeenCalled();
    },
  );

  it.each(["active", "future pending"])("preserves %s account access", async (state) => {
    if (state === "future pending") {
      h.deletionStates = [{ status: "pending", scheduledPurgeAt: new Date(NOW + 1) }];
    }
    expect(await resolveMcpAccount(USER_ID)).toMatchObject({ email: "current@example.test" });
    const res = await invoke("POST /mcp", {
      id: 1,
      method: "tools/call",
      params: { name: "list_botbound_agents", arguments: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.result.structuredContent).toEqual({ agents: [] });
    expect(h.selectedTables).toContain("wireline_agents");
  });

  it("accepts legacy tool names as hidden aliases without listing them", async () => {
    const res = await invoke("POST /mcp", {
      id: 1,
      method: "tools/call",
      params: { name: "list_wireline_agents", arguments: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.result.structuredContent).toEqual({ agents: [] });
    const listed = await invoke("POST /mcp", { id: 2, method: "tools/list", params: {} });
    const names = listed.body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toContain("list_botbound_agents");
    expect(names.join(" ")).not.toMatch(/wireline/i);
    expect(JSON.stringify(listed.body.result.tools)).not.toMatch(/wireline/i);
  });

  it("rejects an orphaned bearer grant without reading account data", async () => {
    h.userExists = false;
    const res = await invoke("POST /mcp", {
      id: 1,
      method: "tools/call",
      params: { name: "get_agent_draft", arguments: { agent_id: "draft-1" } },
    });
    expect(res.statusCode).toBe(401);
    expect(h.selectedTables).toEqual(["wireline_users"]);
    expect(h.getDraft).not.toHaveBeenCalled();
  });

  it.each(terminalStates)(
    "blocks %s sessions before OAuth consent or issuance",
    async (_name, state) => {
      h.deletionStates = [state];
      for (const method of ["GET", "POST"]) {
        const res = await invoke(`${method} /mcp/oauth/authorize`, authorization());
        expect(res.redirectUrl).toContain("/signin?redirect=");
      }
      expect(h.transaction).not.toHaveBeenCalled();
      expect(h.statements.some((sql) => sql.startsWith("INSERT"))).toBe(false);
    },
  );

  it("rechecks deletion after acquiring the authorization transaction", async () => {
    h.beforeTransaction = () => {
      h.deletionStates = [{ status: "purging", scheduledPurgeAt: new Date(NOW - 1) }];
    };
    const res = await invoke("POST /mcp/oauth/authorize", authorization());
    expect(res.redirectUrl).toContain("/signin?redirect=");
    expect(h.transaction).toHaveBeenCalledOnce();
    expect(h.statements.some((sql) => sql.startsWith("INSERT"))).toBe(false);
  });

  it.each(["authorization_code", "refresh_token"])(
    "refuses %s replacement credentials after the deadline",
    async (grantType) => {
      h.deletionStates = [{ status: "pending", scheduledPurgeAt: new Date(NOW) }];
      const res = await invoke("POST /mcp/oauth/token", {
        grant_type: grantType,
        client_id: CLIENT_ID,
        resource: RESOURCE,
        code: "old-code",
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
        refresh_token: "old-refresh",
      });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe("invalid_grant");
      expect(h.statements.some((sql) => sql.startsWith("INSERT"))).toBe(false);
      expect(
        h.statements.some((sql) => sql.startsWith("DELETE FROM wireline_mcp_access_tokens")),
      ).toBe(false);
    },
  );

  it.each(["authorization_code", "refresh_token"])(
    "issues %s credentials during the valid grace period",
    async (grantType) => {
      h.deletionStates = [{ status: "pending", scheduledPurgeAt: new Date(NOW + 60_000) }];
      const res = await invoke("POST /mcp/oauth/token", {
        grant_type: grantType,
        client_id: CLIENT_ID,
        resource: RESOURCE,
        code: "old-code",
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
        refresh_token: "old-refresh",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.access_token).toMatch(/^wlmcp_/);
      expect(res.body.refresh_token).toMatch(/^wlmcp_r_/);
      expect(
        h.statements.filter((sql) => sql.startsWith("INSERT INTO wireline_mcp_")),
      ).toHaveLength(2);
    },
  );
});
