import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({ drizzle: { transaction: h.transaction } }));

import { exchangeMcpGrant, revokeAllMcpGrantsForUser } from "../src/lib/mcp-oauth-security";

type Tables = { access: Set<string>; refresh: Set<string>; codes: Set<string> };
let committed: Tables;
let lockTail: Promise<void>;
let failDelete: string | undefined;
const dialect = new PgDialect();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function clone(tables: Tables): Tables {
  return {
    access: new Set(tables.access),
    refresh: new Set(tables.refresh),
    codes: new Set(tables.codes),
  };
}

beforeEach(() => {
  committed = {
    access: new Set(["old-access"]),
    refresh: new Set(["old-refresh"]),
    codes: new Set(["old-code"]),
  };
  lockTail = Promise.resolve();
  failDelete = undefined;
  h.transaction.mockReset().mockImplementation(async (work) => {
    let working: Tables | undefined;
    let release: (() => void) | undefined;
    const tx = {
      execute: async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const query = dialect.sqlToQuery(statement);
        const text = query.sql.replace(/\s+/g, " ").trim();
        if (text.endsWith("FOR UPDATE")) {
          if (!release) {
            const prior = lockTail;
            const gate = deferred();
            lockTail = gate.promise;
            await prior;
            release = gate.resolve;
            working = clone(committed);
          }
          const grant = text.includes("wireline_mcp_refresh_tokens")
            ? working!.refresh
            : working!.codes;
          if (text.includes("SELECT user_id") && !grant.has(String(query.params[0])))
            return { rows: [] };
          return { rows: [{ id: "user-1" }] };
        }
        if (!working) throw new Error("A grant changed without first locking its account");
        const table = text.includes("wireline_mcp_access_tokens")
          ? "access"
          : text.includes("wireline_mcp_refresh_tokens")
            ? "refresh"
            : "codes";
        if (text.startsWith("DELETE")) {
          if (table === failDelete) throw new Error("Grant deletion failed");
          if (text.includes("token_hash") || text.includes("code_hash")) {
            const existed = working[table].delete(String(query.params[0]));
            return { rows: existed ? [{ user_id: "user-1" }] : [] };
          }
          working[table].clear();
        } else if (text.startsWith("INSERT")) {
          working[table].add(String(query.params[0]));
        }
        return { rows: [] };
      },
    };
    try {
      const result = await work(tx);
      if (working) committed = working;
      return result;
    } finally {
      release?.();
    }
  });
});

describe("MCP issuance and credential revocation", () => {
  it.each([
    ["wireline_mcp_refresh_tokens", "old-refresh", "token_hash"],
    ["wireline_mcp_oauth_codes", "old-code", "code_hash"],
  ] as const)(
    "revocation waits for an in-flight %s exchange and removes its new credentials",
    async (table, hash, column) => {
      const claimed = deferred();
      const finish = deferred();
      const issued = exchangeMcpGrant(table, hash, async (tx) => {
        await tx.execute(
          sql`DELETE FROM ${sql.raw(table)} WHERE ${sql.raw(column)} = ${hash} RETURNING user_id`,
        );
        claimed.resolve();
        await finish.promise;
        await tx.execute(
          sql`INSERT INTO wireline_mcp_access_tokens (token_hash) VALUES (${"new-access"})`,
        );
        await tx.execute(
          sql`INSERT INTO wireline_mcp_refresh_tokens (token_hash) VALUES (${"new-refresh"})`,
        );
        return "new-access";
      });
      await claimed.promise;
      let revoked = false;
      const revoke = revokeAllMcpGrantsForUser("user-1").then(() => {
        revoked = true;
      });
      await Promise.resolve();
      expect(revoked).toBe(false);
      finish.resolve();
      await issued;
      await revoke;
      expect([...committed.access, ...committed.refresh, ...committed.codes]).toEqual([]);
    },
  );

  it("does not exchange a credential after revocation wins the account lock", async () => {
    await revokeAllMcpGrantsForUser("user-1");
    const issue = vi.fn(async () => "unexpected-token");
    expect(await exchangeMcpGrant("wireline_mcp_refresh_tokens", "old-refresh", issue)).toBeNull();
    expect(issue).not.toHaveBeenCalled();
  });

  it("restores the consumed grant if replacement issuance fails", async () => {
    await expect(
      exchangeMcpGrant("wireline_mcp_refresh_tokens", "old-refresh", async (tx) => {
        await tx.execute(
          sql`DELETE FROM wireline_mcp_refresh_tokens WHERE token_hash = ${"old-refresh"} RETURNING user_id`,
        );
        await tx.execute(
          sql`INSERT INTO wireline_mcp_access_tokens (token_hash) VALUES (${"new-access"})`,
        );
        throw new Error("Second credential write failed");
      }),
    ).rejects.toThrow("Second credential write failed");
    expect([...committed.refresh]).toEqual(["old-refresh"]);
    expect([...committed.access]).toEqual(["old-access"]);
  });

  it("fails and rolls back the entire revocation if any credential table cannot be cleared", async () => {
    failDelete = "refresh";
    await expect(revokeAllMcpGrantsForUser("user-1")).rejects.toThrow("Grant deletion failed");
    expect([...committed.access]).toEqual(["old-access"]);
    expect([...committed.refresh]).toEqual(["old-refresh"]);
    expect([...committed.codes]).toEqual(["old-code"]);
  });
});
