import { createHash } from "node:crypto";
import { getTableColumns, getTableName, SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type Selection = Record<string, { name: string }>;
const h = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  calls: [] as string[],
  failRevoke: false,
  afterLock: null as (() => void) | null,
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("drizzle-orm", async (original) => ({
  ...(await original<typeof import("drizzle-orm")>()),
  eq:
    (column: { name: string }, value: unknown): Predicate =>
    (row) =>
      row[column.name] === value,
  gte:
    (column: { name: string }, value: Date): Predicate =>
    (row) =>
      Number(row[column.name]) >= Number(value),
  isNull:
    (column: { name: string }): Predicate =>
    (row) =>
      row[column.name] == null,
  and:
    (...conditions: Predicate[]): Predicate =>
    (row) =>
      conditions.every((test) => test(row)),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: h.select, update: h.update, insert: h.insert, transaction: h.transaction },
  log: { warn: vi.fn(), error: vi.fn() },
  tenantStore: { run: (_id: string, perform: () => unknown) => perform() },
}));
vi.mock("../src/lib/account-service", () => ({
  ensureDefaultAccount: async () => ({ type: "personal" }),
}));
vi.mock("../src/lib/account-type", () => ({ resolveAccountType: () => "personal" }));
vi.mock("../src/lib/breached-passwords", () => ({
  assertPasswordIsSafe: async () => ({ checked: true }),
}));
vi.mock("../src/lib/mcp-oauth-security", () => ({ revokeAllMcpGrantsForUser: h.revoke }));

import { authService, verifyPassword } from "../src/lib/auth-service";
const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const PASSWORD = "Replacement-password-9";
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const project = (row: Row, selection: Selection) =>
  Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[column.name]]));
const users = () => h.rows.wireline_users;
const tokens = () => h.rows.wireline_password_reset_tokens;

function store(transactional = false) {
  const select = (selection?: Selection) => {
    let table: Parameters<typeof getTableName>[0];
    let predicate: Predicate = () => true;
    let locked = false;
    const execute = async () => {
      const name = getTableName(table);
      if (locked) {
        h.calls.push(`lock:${name}`);
        h.afterLock?.();
      }
      return (h.rows[name] || [])
        .filter(predicate)
        .map((row) => project(row, selection ?? getTableColumns(table)));
    };
    const query = {
      from(value: typeof table) {
        table = value;
        return query;
      },
      where(value: Predicate) {
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
        return execute().then(resolve, reject);
      },
    };
    return query;
  };
  const update = (table: Parameters<typeof getTableName>[0]) => {
    let values: Row;
    let predicate: Predicate = () => true;
    const execute = async () => {
      const name = getTableName(table);
      h.calls.push(`update:${name}`);
      const rows = (h.rows[name] || []).filter(predicate);
      const columns = getTableColumns(table);
      for (const row of rows)
        for (const [key, value] of Object.entries(values)) {
          if (key === "passwordHash" && value !== row.password_hash)
            row.session_version = Number(row.session_version) + 1;
          row[columns[key].name] =
            value instanceof SQL ? Number(row[columns[key].name]) + 1 : value;
        }
      return rows;
    };
    const query = {
      set(value: Row) {
        values = value;
        return query;
      },
      where(value: Predicate) {
        predicate = value;
        return query;
      },
      async returning(selection: Selection) {
        return (await execute()).map((row) => project(row, selection));
      },
      then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
        return execute().then(resolve, reject);
      },
    };
    return query;
  };
  const insert = (table: Parameters<typeof getTableName>[0]) => ({
    async values(values: Row) {
      h.calls.push(`insert:${getTableName(table)}`);
      const columns = getTableColumns(table);
      h.rows[getTableName(table)].push(
        Object.fromEntries(
          Object.entries(values).map(([key, value]) => [columns[key].name, value]),
        ),
      );
    },
  });
  return { select, update, insert, transactional };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_JWT_SECRET = "reset-recovery-test-secret-at-least-32-characters";
  h.calls = [];
  h.failRevoke = false;
  h.afterLock = null;
  h.rows = {
    wireline_users: [
      {
        id: OWNER,
        email: "owner@example.com",
        full_name: "Owner",
        password_hash: "original-hash",
        session_version: 4,
      },
    ],
    wireline_password_reset_tokens: ["first", "second", "other"].map((token) => ({
      user_id: token === "other" ? OTHER : OWNER,
      token_hash: tokenHash(token),
      used_at: null,
      expires_at: new Date(Date.now() + 60_000),
    })),
  };
  const outside = store();
  h.select.mockImplementation(outside.select);
  h.update.mockImplementation(outside.update);
  h.insert.mockImplementation(outside.insert);
  h.transaction.mockImplementation(async (perform: (tx: ReturnType<typeof store>) => unknown) => {
    const before = structuredClone(h.rows);
    try {
      return await perform(store(true));
    } catch (error) {
      h.rows = before;
      throw error;
    }
  });
  h.revoke.mockImplementation(async (_id: string, tx?: ReturnType<typeof store>) => {
    h.calls.push(tx?.transactional ? "revoke:transaction" : "revoke:outside");
    if (h.failRevoke) throw new Error("credential cleanup failed");
  });
});

describe("password recovery invalidates the old credential set", () => {
  it("invalidates sibling reset links while preserving another account's links", async () => {
    expect(await authService.completePasswordReset("first", PASSWORD)).not.toBeNull();
    expect(
      tokens()
        .slice(0, 2)
        .every((row) => row.used_at instanceof Date),
    ).toBe(true);
    expect(tokens()[2].used_at).toBeNull();
    expect(await authService.completePasswordReset("second", "Another-password-8")).toBeNull();
    expect(verifyPassword(PASSWORD, String(users()[0].password_hash))).toBe(true);
  });

  it("takes the account lock before claiming a reset token, preventing sibling lock inversion", async () => {
    await authService.completePasswordReset("first", PASSWORD);
    expect(h.calls[0]).toBe("lock:wireline_users");
    expect(h.calls).toContain("revoke:transaction");
    expect(h.calls).not.toContain("revoke:outside");
  });

  it("rolls back the password, sessions, and all reset links when connected-app revocation fails", async () => {
    h.failRevoke = true;
    await expect(authService.completePasswordReset("first", PASSWORD)).rejects.toThrow(
      "credential cleanup failed",
    );
    expect(users()[0].password_hash).toBe("original-hash");
    expect(users()[0].session_version).toBe(4);
    expect(tokens().every((row) => row.used_at === null)).toBe(true);
    h.failRevoke = false;
    expect(await authService.completePasswordReset("first", PASSWORD)).not.toBeNull();
  });

  it("rechecks token validity after waiting for a competing recovery's account lock", async () => {
    h.afterLock = () => {
      tokens()[0].used_at = new Date();
    };
    expect(await authService.completePasswordReset("first", PASSWORD)).toBeNull();
    expect(users()[0].password_hash).toBe("original-hash");
    expect(h.revoke).not.toHaveBeenCalled();
  });

  it.each(["missing", "expired", "used"])(
    "rejects a %s token without changing credentials",
    async (kind) => {
      if (kind === "expired") tokens()[0].expires_at = new Date(0);
      if (kind === "used") tokens()[0].used_at = new Date();
      expect(
        await authService.completePasswordReset(kind === "missing" ? kind : "first", PASSWORD),
      ).toBeNull();
      expect(users()[0].password_hash).toBe("original-hash");
      expect(h.revoke).not.toHaveBeenCalled();
    },
  );

  it("serializes reset-token issuance with credential recovery for that account", async () => {
    const result = await authService.createPasswordResetToken("owner@example.com");
    expect(result?.userId).toBe(OWNER);
    expect(h.calls).toEqual(["lock:wireline_users", "insert:wireline_password_reset_tokens"]);
    expect(tokens()[3].token_hash).toBe(tokenHash(result!.token));
  });
});
