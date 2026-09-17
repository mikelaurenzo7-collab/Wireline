import { createHash } from "node:crypto";
import { getTableColumns, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Handler = (req: unknown, res: unknown, next: (error: unknown) => void) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  rows: {} as Record<string, Row[]>,
  owner: {} as Row,
  trace: [] as string[],
  afterLock: null as (() => void) | null,
  failInsert: false,
  failRevoke: false,
  execute: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("express", () => ({
  default: {
    Router: () =>
      Object.fromEntries(
        ["get", "post", "delete"].map((method) => [
          method,
          (path: string, ...handlers: Handler[]) =>
            h.routes.set(`${method}:${path}`, handlers.at(-1)!),
        ]),
      ),
    urlencoded: () => () => {},
    json: () => () => {},
  },
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { execute: h.execute, select: h.select, transaction: h.transaction },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  fetchWithTimeout: vi.fn(),
  tenantStore: { run: (_id: string, perform: () => unknown) => perform() },
}));
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("../src/lib/app-url", () => ({
  resolveCanonicalAppUrl: () => ({ url: "https://botbound.example" }),
}));
vi.mock("../src/lib/session-cookie", () => ({ getSessionTokenFromRequest: () => "session" }));
vi.mock("../src/lib/auth-utils", () => ({
  verifyInternalJwt: async () => ({
    sub: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    session_version: 4,
  }),
}));

import "../src/routes/chatgpt-mcp-routes";
import { hashMcpOAuthToken, revokeAllMcpGrantsForUser } from "../src/lib/mcp-oauth-security";
const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ACCESS = "wireline_mcp_access_tokens";
const REFRESH = "wireline_mcp_refresh_tokens";
const CODES = "wireline_mcp_oauth_codes";
const RESOURCE = "https://botbound.example/mcp";
const CALLBACK = "https://client.example/callback";
const VERIFIER = "v".repeat(64);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const dialect = new PgDialect();

// The real helpers and routes compile real Drizzle SQL. Only storage is
// substituted: transactions restore rows on failure, and the lock hook models
// recovery winning before a credential exchange acquires the account lock.
function database(transactional = false) {
  return {
    async execute(statement: SQL) {
      const compiled = dialect.sqlToQuery(statement);
      const query = compiled.sql.replace(/\s+/g, " ").trim();
      const params = compiled.params;
      const table = /(?:FROM|INTO) (wireline_mcp_\w+)/.exec(query)?.[1];
      if (!table || !h.rows[table]) return { rows: [], rowCount: 0 };
      if (query.includes("expires_at < now()")) return { rows: [], rowCount: 0 };
      h.trace.push(`${transactional ? "tx" : "outside"}:${query.split(" ")[0]}:${table}`);
      if (query.startsWith("INSERT")) {
        if (h.failInsert && table === REFRESH) throw new Error("token write failed");
        const columns = /\(([^)]+)\)/.exec(query)![1].split(", ");
        h.rows[table].push(
          Object.fromEntries(columns.map((column, index) => [column, params[index]])),
        );
        return { rows: [], rowCount: 1 };
      }
      const hashColumn = table === CODES ? "code_hash" : "token_hash";
      const byHash = query.includes(`WHERE ${hashColumn} =`);
      const matches = (row: Row) =>
        byHash
          ? row[hashColumn] === params[0] &&
            (!query.includes("AND user_id") || row.user_id === params[1])
          : row.user_id === params[0] &&
            (!query.includes("AND client_id") || row.client_id === params[1]);
      const rows = h.rows[table].filter(matches);
      if (query.startsWith("DELETE")) {
        if (h.failRevoke && table === REFRESH) throw new Error("revocation failed");
        h.rows[table] = h.rows[table].filter((row) => !matches(row));
      }
      return { rows: structuredClone(rows), rowCount: rows.length };
    },
    select(selection?: Record<string, { name: string }>) {
      let table: Parameters<typeof getTableColumns>[0];
      let predicate: SQL;
      let locked = false;
      const query = {
        from(value: typeof table) {
          table = value;
          return query;
        },
        where(value: SQL) {
          predicate = value;
          return query;
        },
        limit() {
          return query;
        },
        for() {
          locked = true;
          return query;
        },
        then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              if (locked) {
                h.trace.push(`${transactional ? "tx" : "outside"}:LOCK`);
                h.afterLock?.();
              }
              if (dialect.sqlToQuery(predicate).params[0] !== h.owner.id) return [];
              return [
                Object.fromEntries(
                  Object.entries(selection ?? getTableColumns(table)).map(([key, column]) => [
                    key,
                    h.owner[column.name],
                  ]),
                ),
              ];
            })
            .then(resolve, reject);
        },
      };
      return query;
    },
  };
}

async function request(path: "token" | "authorize", body: Row) {
  let status = 200;
  let data: Row = {};
  let redirected = "";
  let failure: unknown;
  const response = {
    status(value: number) {
      status = value;
      return response;
    },
    json(value: Row) {
      data = value;
      return response;
    },
    redirect(value: string) {
      redirected = value;
      return response;
    },
    setHeader() {},
  };
  await h.routes.get(`post:/mcp/oauth/${path}`)!(
    { body, ip: "192.0.2.1", originalUrl: `/mcp/oauth/${path}` },
    response,
    (error) => {
      failure = error;
    },
  );
  return { status, data, redirected, failure };
}
const exchange = (kind: "authorization_code" | "refresh_token", extra: Row = {}) =>
  request("token", {
    grant_type: kind,
    client_id: "client",
    resource: RESOURCE,
    code: "code",
    redirect_uri: CALLBACK,
    code_verifier: VERIFIER,
    refresh_token: "refresh",
    ...extra,
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MCP_OAUTH_TOKEN_PEPPER = "mcp-recovery-pepper-at-least-32-characters";
  process.env.INTERNAL_JWT_SECRET = "mcp-recovery-secret-at-least-32-characters";
  process.env.MCP_OAUTH_ALLOWED_CLIENT_IDS = "client";
  process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS = CALLBACK;
  h.owner = {
    id: OWNER,
    email: "owner@example.com",
    session_version: 4,
    session_revoked_before: new Date(0),
  };
  h.trace = [];
  h.afterLock = null;
  h.failInsert = false;
  h.failRevoke = false;
  const grant = {
    user_id: OWNER,
    email: "owner@example.com",
    client_id: "client",
    scope: "agents.read",
    resource: RESOURCE,
    expires_at: new Date(Date.now() + 60_000),
  };
  h.rows = {
    [ACCESS]: [
      { ...grant, token_hash: "old-access" },
      { ...grant, user_id: OTHER, token_hash: "other-access" },
    ],
    [REFRESH]: [{ ...grant, token_hash: hashMcpOAuthToken("refresh") }],
    [CODES]: [
      {
        ...grant,
        code_hash: hashMcpOAuthToken("code"),
        redirect_uri: CALLBACK,
        code_challenge: CHALLENGE,
      },
    ],
  };
  const outside = database();
  h.execute.mockImplementation(outside.execute);
  h.select.mockImplementation(outside.select);
  h.transaction.mockImplementation(
    async (perform: (tx: ReturnType<typeof database>) => unknown) => {
      const before = structuredClone(h.rows);
      try {
        return await perform(database(true));
      } catch (error) {
        h.rows = before;
        throw error;
      }
    },
  );
});

describe.each(["authorization_code", "refresh_token"] as const)("%s recovery boundary", (kind) => {
  const source = kind === "authorization_code" ? CODES : REFRESH;
  it("claims and rotates credentials in one account-locked transaction", async () => {
    const result = await exchange(kind);
    expect(result.failure).toBeUndefined();
    expect(result.data.access_token).toMatch(/^wlmcp_/);
    expect(result.data.refresh_token).toMatch(/^wlmcp_r_/);
    expect(h.trace.indexOf("tx:LOCK")).toBeGreaterThan(-1);
    expect(h.trace.indexOf(`tx:DELETE:${source}`)).toBeGreaterThan(h.trace.indexOf("tx:LOCK"));
    expect(
      h.trace
        .filter((step) => /:(?:DELETE|INSERT):/.test(step))
        .every((step) => step.startsWith("tx:")),
    ).toBe(true);
    expect(h.rows[ACCESS].some((row) => row.token_hash === "other-access")).toBe(true);
  });

  it("rejects a grant revoked while its exchange waited for the account lock", async () => {
    h.afterLock = () => {
      h.rows[source] = [];
    };
    const result = await exchange(kind);
    expect(result.failure).toBeUndefined();
    expect(result.status).toBe(400);
    expect(result.data.error).toBe("invalid_grant");
    expect(h.trace.some((step) => step.includes(":INSERT:"))).toBe(false);
  });

  it("preserves the source grant and existing access when a replacement write fails", async () => {
    const before = structuredClone(h.rows);
    h.failInsert = true;
    const result = await exchange(kind);
    expect(result.failure).toBeInstanceOf(Error);
    expect(h.rows).toEqual(before);
    h.failInsert = false;
    expect((await exchange(kind)).data.access_token).toMatch(/^wlmcp_/);
  });

  it("does not issue credentials for an expired grant", async () => {
    h.rows[source][0].expires_at = new Date(0);
    expect((await exchange(kind)).status).toBe(400);
    expect(h.trace.some((step) => step.includes(":INSERT:"))).toBe(false);
  });

  it("does not issue credentials to a different client", async () => {
    expect((await exchange(kind, { client_id: "another-client" })).status).toBe(400);
    expect(h.trace.some((step) => step.includes(":INSERT:"))).toBe(false);
  });
});

describe("connected-app recovery and authorization", () => {
  it("disconnects all grant types together and preserves other accounts", async () => {
    await revokeAllMcpGrantsForUser(OWNER);
    expect(h.trace[0]).toBe("tx:LOCK");
    expect(h.rows[ACCESS].map((row) => row.user_id)).toEqual([OTHER]);
    expect(h.rows[REFRESH]).toEqual([]);
    expect(h.rows[CODES]).toEqual([]);
  });

  it("rolls back disconnect when one credential table cannot be updated", async () => {
    const before = structuredClone(h.rows);
    h.failRevoke = true;
    await expect(revokeAllMcpGrantsForUser(OWNER)).rejects.toThrow("revocation failed");
    expect(h.rows).toEqual(before);
  });

  it.each([false, true])(
    "revalidates the browser session under the account lock (reset=%s)",
    async (reset) => {
      if (reset)
        h.afterLock = () => {
          h.owner.session_version = 5;
        };
      const result = await request("authorize", {
        response_type: "code",
        client_id: "client",
        redirect_uri: CALLBACK,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        resource: RESOURCE,
      });
      expect(result.failure).toBeUndefined();
      expect(h.trace).toContain("tx:LOCK");
      expect(result.redirected.startsWith(reset ? "/signin?redirect=" : `${CALLBACK}?code=`)).toBe(
        true,
      );
      expect(h.trace.includes(`tx:INSERT:${CODES}`)).toBe(!reset);
    },
  );
});
