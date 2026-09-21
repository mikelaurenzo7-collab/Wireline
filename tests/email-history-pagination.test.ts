import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as Array<Array<Record<string, unknown>>>,
  queries: [] as Array<{
    table?: string;
    where?: unknown;
    order?: unknown[];
    limit?: number;
    offset?: number;
  }>,
  touchNavCounts: vi.fn(),
  updates: [] as Array<{ values?: unknown; where?: unknown }>,
}));

vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  drizzle: {
    select: () => {
      const query: (typeof h.queries)[number] = {};
      const rows = h.rows.shift() ?? [];
      h.queries.push(query);
      const builder = {
        from(table: string) {
          query.table = table;
          return builder;
        },
        where(value: unknown) {
          query.where = value;
          return builder;
        },
        orderBy(...values: unknown[]) {
          query.order = values;
          return builder;
        },
        limit(value: number) {
          query.limit = value;
          return builder;
        },
        offset(value: number) {
          query.offset = value;
          return builder;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
    update: () => {
      const update: (typeof h.updates)[number] = {};
      h.updates.push(update);
      const builder = {
        set(values: unknown) {
          update.values = values;
          return builder;
        },
        where(where: unknown) {
          update.where = where;
          return Promise.resolve();
        },
      };
      return builder;
    },
  },
}));
vi.mock("../src/db/schema", () => ({
  emailAccounts: { id: "accounts.id", userId: "accounts.userId", agentId: "accounts.agentId" },
  emailThreads: {
    id: "threads.id",
    userId: "threads.userId",
    accountId: "threads.accountId",
    lastMessageAt: "threads.lastMessageAt",
  },
  agents: {},
  emailMessages: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: (left: unknown, right: unknown) => ["eq", left, right],
  and: (...values: unknown[]) => ["and", ...values],
  inArray: (column: unknown, values: unknown[]) => ["inArray", column, values],
  desc: (column: unknown) => ["desc", column],
  asc: (column: unknown) => ["asc", column],
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createIpRateLimiter: () => vi.fn() }));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => vi.fn(),
  emailThreadsReadStateSchema: {},
}));
vi.mock("../src/lib/server-utils", () => ({
  getErrorMessage: String,
  mapObjectToSnake: (value: unknown) => value,
}));
vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: h.touchNavCounts }));

import router from "../src/routes/email-routes";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
function handler(path: string): Handler {
  const layers = (
    router as unknown as {
      stack: Array<{ route?: { path: string; stack: Array<{ handle: Handler }> } }>;
    }
  ).stack;
  return layers.find((layer) => layer.route?.path === path)!.route!.stack.at(-1)!.handle;
}
async function list(query: Record<string, string> = {}) {
  const json = vi.fn();
  await handler("/api/emails/threads")({ user: { id: "owner" }, query }, { json });
  return json.mock.calls[0][0];
}

beforeEach(() => {
  h.rows = [];
  h.queries = [];
  h.updates = [];
  h.touchNavCounts.mockReset();
});

describe("tenant-scoped email history pages", () => {
  it("returns a bounded page and a continuation without widening tenant scope", async () => {
    h.rows = [[{ id: "a" }, { id: "b" }, { id: "sentinel" }]];
    expect(await list({ limit: "2", offset: "100" })).toEqual({
      threads: [{ id: "a" }, { id: "b" }],
      hasMore: true,
      nextOffset: 102,
    });
    expect(h.queries[0]).toMatchObject({
      where: ["eq", "threads.userId", "owner"],
      limit: 3,
      offset: 100,
      order: [
        ["desc", "threads.lastMessageAt"],
        ["desc", "threads.id"],
      ],
    });
  });

  it("bounds hostile page sizes and normalizes invalid offsets", async () => {
    h.rows = [[]];
    expect(await list({ limit: "999999999", offset: "Infinity" })).toEqual({
      threads: [],
      hasMore: false,
      nextOffset: 0,
    });
    expect(h.queries[0]).toMatchObject({ limit: 101, offset: 0 });
  });

  it("keeps both owner and owned-mailbox predicates on later pages", async () => {
    h.rows = [[{ id: "mailbox", agentId: "bot" }], [{ id: "older" }]];
    expect(await list({ account_id: "mailbox", agent_id: "bot", offset: "100" })).toEqual({
      threads: [{ id: "older" }],
      hasMore: false,
      nextOffset: 101,
    });
    expect(h.queries[0].where).toEqual([
      "and",
      ["eq", "accounts.id", "mailbox"],
      ["eq", "accounts.userId", "owner"],
    ]);
    expect(h.queries[1].where).toEqual([
      "and",
      ["eq", "threads.userId", "owner"],
      ["inArray", "threads.accountId", ["mailbox"]],
    ]);
  });

  it("does not fall back to all mail when a mailbox is unavailable or mismatched", async () => {
    h.rows = [[]];
    expect(await list({ account_id: "foreign", offset: "100" })).toEqual({
      threads: [],
      hasMore: false,
      nextOffset: 100,
    });
    expect(h.queries).toHaveLength(1);
    h.queries = [];
    h.rows = [[{ id: "mailbox", agentId: "other-bot" }]];
    expect((await list({ account_id: "mailbox", agent_id: "bot" })).threads).toEqual([]);
    expect(h.queries).toHaveLength(1);
  });

  it("marks only the owner's selected IDs read and invalidates attention counts", async () => {
    const json = vi.fn();
    await handler("/api/emails/threads/read-state")(
      { user: { id: "owner" }, body: { ids: ["thread"], read: true } },
      { json },
    );
    expect(h.updates[0]).toEqual({
      values: { read: true },
      where: ["and", ["inArray", "threads.id", ["thread"]], ["eq", "threads.userId", "owner"]],
    });
    expect(h.touchNavCounts).toHaveBeenCalledWith("owner");
  });
});
