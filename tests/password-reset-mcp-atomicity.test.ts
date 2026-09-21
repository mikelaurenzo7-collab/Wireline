import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Table = { kind: "user" | "reset" | "subscription" };
type Predicate =
  | { operation: "eq" | "gte"; column: string; value: unknown }
  | { operation: "null"; column: string }
  | { operation: "and"; predicates: Predicate[] };

const h = vi.hoisted(() => ({
  users: {} as Record<string, Row>,
  resets: {} as Record<string, Row>,
  locks: new Map<string, { owner: number; waiting: Array<{ owner: number; ready: () => void }> }>(),
  nextTransaction: 0,
  revoke: vi.fn(),
  duringKdf: undefined as (() => void) | undefined,
}));

vi.mock("../src/db/schema", () => ({
  users: { kind: "user", id: "id", email: "email", passwordHash: "passwordHash" },
  passwordResetTokens: {
    kind: "reset",
    userId: "userId",
    tokenHash: "tokenHash",
    usedAt: "usedAt",
    expiresAt: "expiresAt",
  },
  subscriptions: { kind: "subscription", plan: "plan", userId: "userId" },
}));
vi.mock("../src/db/security-schema", () => ({
  sessionUsers: { kind: "user", id: "id", sessionVersion: "sessionVersion" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ operation: "eq", column, value }),
  gte: (column: string, value: unknown) => ({ operation: "gte", column, value }),
  isNull: (column: string) => ({ operation: "null", column }),
  and: (...predicates: Predicate[]) => ({ operation: "and", predicates }),
  getTableColumns: vi.fn(),
  sql: (_parts: TemplateStringsArray, column: string) => ({ increment: column }),
}));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
  // Exercise the service without allocating 128 MiB for each password hash.
  scrypt: (_password: string, _salt: string, _size: number, ...rest: unknown[]) => {
    h.duringKdf?.();
    (rest.at(-1) as (error: null, key: Buffer) => void)(null, Buffer.alloc(64, 1));
  },
}));
vi.mock("../src/lib/breached-passwords", () => ({
  assertPasswordIsSafe: async () => ({ checked: true }),
}));
vi.mock("../src/lib/account-service", () => ({
  ensureDefaultAccount: async () => ({ type: "business" }),
}));
vi.mock("../src/lib/mcp-oauth-security", () => ({ revokeAllMcpGrantsForUser: h.revoke }));
vi.mock("../src/lib/server-context", () => {
  function matches(row: Row, predicate: Predicate): boolean {
    if (predicate.operation === "and")
      return predicate.predicates.every((item) => matches(row, item));
    if (predicate.operation === "null") return row[predicate.column] == null;
    if (predicate.operation === "gte")
      return Number(row[predicate.column]) >= Number(predicate.value);
    return row[predicate.column] === predicate.value;
  }

  function project(row: Row, selection?: Record<string, string>): Row {
    return selection
      ? Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[column]]))
      : { ...row };
  }

  async function acquire(key: string, owner: number): Promise<void> {
    const current = h.locks.get(key);
    if (!current) {
      h.locks.set(key, { owner, waiting: [] });
      return;
    }
    if (current.owner === owner) return;
    await new Promise<void>((ready) => current.waiting.push({ owner, ready }));
  }

  function release(owner: number): void {
    for (const [key, lock] of h.locks) {
      if (lock.owner !== owner) continue;
      const next = lock.waiting.shift();
      if (next) {
        lock.owner = next.owner;
        next.ready();
      } else h.locks.delete(key);
    }
  }

  // A small READ COMMITTED store: writes and FOR UPDATE hold row locks through
  // commit; waiting writes recheck their predicates; errors discard all writes.
  // Reads are never globally serialized, so concurrent reset tests exercise the
  // service's own account-row ordering rather than a fixture-wide mutex.
  function connection(owner = 0) {
    const pendingUsers: Record<string, Row> = {};
    const pendingResets: Record<string, Row> = {};
    const rows = (table: Table): Record<string, Row> =>
      table.kind === "user"
        ? { ...h.users, ...pendingUsers }
        : table.kind === "reset"
          ? { ...h.resets, ...pendingResets }
          : Object.fromEntries(
              Object.keys(h.users).map((userId) => [userId, { userId, plan: "free" }]),
            );
    const write = (table: Table, key: string, row: Row) => {
      const target =
        owner === 0
          ? table.kind === "user"
            ? h.users
            : h.resets
          : table.kind === "user"
            ? pendingUsers
            : pendingResets;
      target[key] = row;
    };

    const db = {
      select: (selection?: Record<string, string>) => {
        let table: Table;
        let predicate: Predicate;
        let locked = false;
        let count = Infinity;
        let result: Promise<Row[]> | undefined;
        const execute = async () => {
          const found: Row[] = [];
          for (const [key, initial] of Object.entries(rows(table))) {
            if (!matches(initial, predicate)) continue;
            if (locked) await acquire(`${table.kind}:${key}`, owner);
            const current = rows(table)[key];
            if (current && matches(current, predicate)) found.push(project(current, selection));
            if (found.length >= count) break;
          }
          return found;
        };
        const query = {
          from: (value: Table) => {
            table = value;
            return query;
          },
          where: (value: Predicate) => {
            predicate = value;
            return query;
          },
          limit: (value: number) => {
            count = value;
            return query;
          },
          for: () => {
            locked = true;
            return query;
          },
          then: (resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) =>
            (result ??= execute()).then(resolve, reject),
        };
        return query;
      },
      update: (table: Table) => ({
        set: (changes: Row) => ({
          where: (predicate: Predicate) => {
            let result: Promise<Row[]> | undefined;
            const execute = async () => {
              const changed: Row[] = [];
              for (const [key, initial] of Object.entries(rows(table))) {
                if (!matches(initial, predicate)) continue;
                await acquire(`${table.kind}:${key}`, owner);
                const current = rows(table)[key];
                if (!current || !matches(current, predicate)) continue;
                const next = { ...current };
                for (const [column, value] of Object.entries(changes)) {
                  next[column] =
                    value && typeof value === "object" && "increment" in value
                      ? Number(current[String(value.increment)]) + 1
                      : value;
                }
                // The production password-change trigger also rotates the version.
                if (
                  table.kind === "user" &&
                  "passwordHash" in changes &&
                  changes.passwordHash !== current.passwordHash
                ) {
                  next.sessionVersion = Number(current.sessionVersion) + 1;
                }
                write(table, key, next);
                changed.push(next);
              }
              return changed;
            };
            return {
              returning: async (selection?: Record<string, string>) =>
                (await (result ??= execute())).map((row) => project(row, selection)),
              then: (resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) =>
                (result ??= execute()).then(resolve, reject),
            };
          },
        }),
      }),
      insert: (table: Table) => ({
        values: async (value: Row) => {
          const key = String(value.tokenHash);
          await acquire(`${table.kind}:${key}`, owner);
          write(table, key, { usedAt: null, ...value });
          if (owner === 0) release(owner);
        },
      }),
      commit: () => {
        Object.assign(h.users, pendingUsers);
        Object.assign(h.resets, pendingResets);
      },
    };
    return db;
  }

  return {
    log: { warn: vi.fn(), error: vi.fn() },
    tenantStore: { run: (_id: string, work: () => unknown) => work() },
    drizzle: {
      ...connection(),
      transaction: async (work: (tx: ReturnType<typeof connection>) => Promise<unknown>) => {
        const owner = ++h.nextTransaction;
        const tx = connection(owner);
        try {
          const result = await work(tx);
          tx.commit();
          return result;
        } finally {
          release(owner);
        }
      },
    },
  };
});

import { authService } from "../src/lib/auth-service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

async function issue(email = "owner@example.test") {
  const result = await authService.createPasswordResetToken(email);
  expect(result).not.toBeNull();
  return result!;
}

function latch() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

beforeEach(() => {
  vi.useRealTimers();
  process.env.INTERNAL_JWT_SECRET = "wireline-test-internal-jwt-secret-minimum-32-chars";
  delete process.env.SUPABASE_JWT_SECRET;
  h.users = Object.fromEntries(
    [
      [USER_ID, "owner@example.test"],
      [OTHER_ID, "other@example.test"],
    ].map(([id, email]) => [id, { id, email, passwordHash: "original", sessionVersion: 2 }]),
  );
  h.resets = {};
  h.locks.clear();
  h.nextTransaction = 0;
  h.duringKdf = undefined;
  h.revoke.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

describe("password reset credential revocation", () => {
  it("closes sibling links after recovery without consuming another account's link", async () => {
    const older = await issue();
    const newer = await issue();
    const other = await issue("other@example.test");
    expect(await authService.completePasswordReset(newer.token, "new-password")).not.toBeNull();
    const secured = { ...h.users[USER_ID] };

    expect(await authService.completePasswordReset(older.token, "another-password")).toBeNull();
    expect(await authService.completePasswordReset(newer.token, "another-password")).toBeNull();
    expect(h.users[USER_ID]).toEqual(secured);
    expect(await authService.completePasswordReset(other.token, "other-password")).not.toBeNull();
    expect(h.revoke.mock.calls.map(([id]) => id)).toEqual([USER_ID, OTHER_ID]);
  });

  it("allows exactly one concurrent reset from different links for the same account", async () => {
    const first = await issue();
    const second = await issue();
    const results = await Promise.all([
      authService.completePasswordReset(first.token, "first-password"),
      authService.completePasswordReset(second.token, "second-password"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(h.revoke).toHaveBeenCalledTimes(1);
    expect(Object.values(h.resets).every((row) => row.usedAt instanceof Date)).toBe(true);
    expect(h.locks.size).toBe(0);
  });

  it("issues a racing new request only after reset completion and keeps that later link usable", async () => {
    const first = await issue();
    const entered = latch();
    const finish = latch();
    h.revoke.mockImplementationOnce(async () => {
      entered.open();
      await finish.promise;
    });
    const completing = authService.completePasswordReset(first.token, "first-password");
    await entered.promise;
    let issued = false;
    const requesting = issue().then((result) => {
      issued = true;
      return result;
    });
    try {
      await vi.waitFor(() => expect(h.locks.get(`user:${USER_ID}`)?.waiting).toHaveLength(1));
      expect(issued).toBe(false);
    } finally {
      finish.open();
    }

    expect(await completing).not.toBeNull();
    const later = await requesting;
    expect(await authService.completePasswordReset(later.token, "later-password")).not.toBeNull();
  });

  it("rolls back the password, sessions and all link consumption when connector revocation fails", async () => {
    const first = await issue();
    const sibling = await issue();
    const before = structuredClone({ users: h.users, resets: h.resets });
    h.revoke.mockRejectedValueOnce(new Error("Connector revocation unavailable"));

    await expect(authService.completePasswordReset(first.token, "new-password")).rejects.toThrow(
      "Connector revocation unavailable",
    );
    expect({ users: h.users, resets: h.resets }).toEqual(before);
    expect(h.locks.size).toBe(0);
    expect(await authService.completePasswordReset(sibling.token, "retry-password")).not.toBeNull();
    expect(await authService.completePasswordReset(first.token, "old-link-password")).toBeNull();
  });

  it("returns a new session only after connector revocation and the password commit", async () => {
    const reset = await issue();
    h.revoke.mockImplementation(async (id: string) => {
      expect(id).toBe(USER_ID);
      expect(h.users[USER_ID].passwordHash).toBe("original");
      expect(Object.values(h.resets)[0].usedAt).toBeNull();
    });
    const result = await authService.completePasswordReset(reset.token, "new-password");
    expect(h.users[USER_ID].passwordHash).not.toBe("original");
    const token = JSON.parse(Buffer.from(result!.token.split(".")[1], "base64url").toString());
    expect(token.session_version).toBe(h.users[USER_ID].sessionVersion);
  });

  it("rejects a token that expires during password hashing without consuming a newer link", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    const expiring = await issue();
    vi.setSystemTime(new Date("2026-09-20T12:59:59Z"));
    const newer = await issue();
    h.duringKdf = () => vi.setSystemTime(new Date("2026-09-20T13:00:01Z"));

    expect(await authService.completePasswordReset(expiring.token, "new-password")).toBeNull();
    expect(h.users[USER_ID].passwordHash).toBe("original");
    expect(h.revoke).not.toHaveBeenCalled();
    expect(await authService.completePasswordReset(newer.token, "new-password")).not.toBeNull();
  });

  it("does not change account credentials for an unknown token or unknown email", async () => {
    expect(await authService.createPasswordResetToken("missing@example.test")).toBeNull();
    expect(await authService.completePasswordReset("unknown-token", "new-password")).toBeNull();
    expect(h.users[USER_ID].passwordHash).toBe("original");
    expect(h.resets).toEqual({});
    expect(h.revoke).not.toHaveBeenCalled();
  });
});
