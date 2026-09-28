import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({ drizzle: { transaction: h.transaction } }));
import { revokeMcpGrantByToken } from "../src/lib/mcp-oauth-security";
const dialect = new PgDialect();
type Grant = { userId: string; clientId: string; resource: string; hash: string };
let grants: Grant[];
let queries: Array<{ sql: string; params: unknown[] }>;
let rotateWhileLocking: boolean;
beforeEach(() => {
  rotateWhileLocking = false;
  grants = [
    {
      userId: "owner-1",
      clientId: "botbound-desktop",
      resource: "https://botbound.app/mcp",
      hash: "holder",
    },
    {
      userId: "owner-2",
      clientId: "botbound-desktop",
      resource: "https://botbound.app/mcp",
      hash: "other-owner",
    },
    {
      userId: "owner-1",
      clientId: "other-client",
      resource: "https://botbound.app/mcp",
      hash: "other-app",
    },
  ];
  queries = [];
  h.transaction.mockImplementation(async (work) =>
    work({
      execute: async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const query = dialect.sqlToQuery(statement);
        query.sql = query.sql.replace(/\s+/g, " ").trim();
        queries.push(query);
        if (query.sql.startsWith("SELECT")) {
          const [hash, clientId, resource] = query.params;
          const matches = grants.filter(
            (grant) =>
              grant.hash === hash && grant.clientId === clientId && grant.resource === resource,
          );
          if (query.sql.endsWith("FOR UPDATE")) {
            if (rotateWhileLocking) grants = grants.filter((grant) => grant.hash !== hash);
            return { rows: matches.map((grant) => ({ id: grant.userId })) };
          }
          return { rows: matches.map((grant) => ({ user_id: grant.userId })) };
        }
        const [userId, clientId, resource] = query.params;
        grants = grants.filter(
          (grant) =>
            !(
              grant.userId === userId &&
              grant.clientId === clientId &&
              grant.resource === resource
            ),
        );
        return { rows: [] };
      },
    }),
  );
});
const request = {
  tokenHash: "holder",
  clientId: "botbound-desktop",
  resource: "https://botbound.app/mcp",
};
describe("token-holder MCP disconnection", () => {
  it("locks then rechecks binding and revokes only that owner/client/resource", async () => {
    await revokeMcpGrantByToken(request);
    expect(queries[0].sql).toContain("FOR UPDATE");
    expect(queries[1].sql).toContain("expires_at > now()");
    const deletes = queries.filter((query) => query.sql.startsWith("DELETE"));
    expect(deletes).toHaveLength(3);
    for (const query of deletes)
      expect(query.params).toEqual(["owner-1", "botbound-desktop", "https://botbound.app/mcp"]);
    expect(grants.map((grant) => grant.hash)).toEqual(["other-owner", "other-app"]);
    await revokeMcpGrantByToken(request);
    expect(grants).toHaveLength(2);
  });
  it.each([
    { clientId: "other-client" },
    { resource: "https://evil.example/mcp" },
    { tokenHash: "unknown" },
  ])("leaves every grant unchanged for mismatch %j", async (override) => {
    await revokeMcpGrantByToken({ ...request, ...override });
    expect(queries.some((query) => query.sql.startsWith("DELETE"))).toBe(false);
    expect(grants).toHaveLength(3);
  });
  it("does not use stale token ownership after waiting for a concurrent rotation", async () => {
    rotateWhileLocking = true;
    await revokeMcpGrantByToken(request);
    expect(queries.some((query) => query.sql.startsWith("DELETE"))).toBe(false);
    expect(grants.map((grant) => grant.hash)).toEqual(["other-owner", "other-app"]);
  });
});
