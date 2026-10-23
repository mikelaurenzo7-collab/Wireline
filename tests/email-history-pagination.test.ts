import { beforeEach, describe, expect, it, vi } from "vitest";

type SqlFragment = { parts: string[]; values: unknown[] };
type TestRow = Record<string, unknown>;
const AS_OF = "2026-09-21T05:00:00.123456Z";
const IDS = [1, 2, 3, 4].map(
  (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
);

const h = vi.hoisted(() => ({
  rows: [] as Array<Array<Record<string, unknown>>>,
  simulation: null as null | {
    threads: TestRow[];
    messages: TestRow[];
    accounts?: TestRow[];
    handoffs?: TestRow[];
    asOf: string;
  },
  queries: [] as Array<{
    table?: TestRow;
    columns?: TestRow;
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
    select: (columns?: TestRow) => {
      const query: (typeof h.queries)[number] = { columns };
      const rows = h.rows.shift() ?? [];
      h.queries.push(query);
      const builder = {
        from(table: TestRow) {
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
          return Promise.resolve(
            h.simulation ? executeSnapshotQuery(query, h.simulation) : rows,
          ).then(resolve);
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
  emailAccounts: {
    $table: "accounts",
    id: "accounts.id",
    userId: "accounts.userId",
    agentId: "accounts.agentId",
  },
  emailThreads: {
    $table: "threads",
    id: "threads.id",
    userId: "threads.userId",
    accountId: "threads.accountId",
    agentId: "threads.agentId",
    subject: "threads.subject",
    status: "threads.status",
    summary: "threads.summary",
    customerEmail: "threads.customerEmail",
    lastMessageAt: "threads.lastMessageAt",
    createdAt: "threads.createdAt",
  },
  agents: {},
  followUpTasks: {
    $table: "handoffs",
    id: "handoffs.id",
    userId: "handoffs.userId",
    sourceType: "handoffs.sourceType",
    sourceId: "handoffs.sourceId",
    taskType: "handoffs.taskType",
    status: "handoffs.status",
  },
  emailMessages: {
    $table: "messages",
    id: "messages.id",
    userId: "messages.userId",
    threadId: "messages.threadId",
    createdAt: "messages.createdAt",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: (left: unknown, right: unknown) => ["eq", left, right],
  and: (...values: unknown[]) => ["and", ...values],
  inArray: (column: unknown, values: unknown[]) => ["inArray", column, values],
  desc: (column: unknown) => ["desc", column],
  asc: (column: unknown) => ["asc", column],
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
    parts: Array.from(parts),
    values,
  }),
  getTableColumns: (table: TestRow) =>
    Object.fromEntries(Object.entries(table).filter(([key]) => key !== "$table")),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createIpRateLimiter: () => vi.fn(),
  emailReplyRateLimiter: vi.fn(),
}));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => vi.fn(),
  emailThreadReplyAcknowledgeSchema: {},
  emailThreadReplySchema: {},
  emailThreadsReadStateSchema: {},
}));
vi.mock("../src/lib/email-thread-reply", () => ({ sendEmailThreadReply: vi.fn() }));
vi.mock("../src/lib/server-utils", () => ({
  getErrorMessage: String,
  mapObjectToSnake: (value: unknown) => value,
}));
vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: h.touchNavCounts }));

import router from "../src/routes/email-routes";
import outcomeRouter from "../src/routes/email-outcome-routes";

function isSql(value: unknown): value is SqlFragment {
  return Boolean(value && typeof value === "object" && "parts" in value && "values" in value);
}
function activity(fragment: SqlFragment, row: TestRow, messages: TestRow[]): string {
  // This small DB double consumes the query's actual bound watermark/cutoff;
  // the test mutates provider rows between requests without touching old events.
  expect(fragment.parts.join("?")).toContain("select max(");
  const [userId, watermark, asOf] = [fragment.values[3], fragment.values[7], fragment.values[9]];
  const times = messages
    .filter(
      (message) =>
        message.userId === userId &&
        message.threadId === row.id &&
        BigInt(String(message.id)) <= BigInt(String(watermark)) &&
        String(message.createdAt) <= String(asOf),
    )
    .map((message) => String(message.createdAt));
  return times.sort().at(-1) ?? String(row.createdAt ?? "1970-01-01T00:00:00.000000Z");
}
function matches(
  condition: unknown,
  row: TestRow,
  simulation: NonNullable<typeof h.simulation>,
): boolean {
  if (condition === undefined) return true;
  if (Array.isArray(condition)) {
    const [operator, column, value] = condition;
    if (operator === "and")
      return condition.slice(1).every((item) => matches(item, row, simulation));
    if (operator === "eq") return row[String(column).split(".").at(-1)!] === value;
    if (operator === "inArray")
      return (value as unknown[]).includes(row[String(column).split(".").at(-1)!]);
  }
  if (isSql(condition)) {
    if (condition.parts.join("?").includes(") < (")) {
      const time = activity(condition.values[0] as SqlFragment, row, simulation.messages);
      return (
        time < String(condition.values[2]) ||
        (time === condition.values[2] && String(row.id) < String(condition.values[3]))
      );
    }
    if (condition.parts.join("?").includes("coalesce("))
      return String(row.createdAt ?? "1970-01-01T00:00:00.000000Z") <= String(condition.values[1]);
  }
  throw new Error("Unexpected history predicate");
}
function executeSnapshotQuery(
  query: (typeof h.queries)[number],
  simulation: NonNullable<typeof h.simulation>,
) {
  // Outcome reads use the same actual bound equality and membership predicates.
  // This is a data double, not a PostgreSQL integration or authentication test.
  if (!query.columns?.asOf && !query.columns?.snapshotActivity) {
    const rows =
      query.table?.$table === "accounts"
        ? (simulation.accounts ?? [])
        : query.table?.$table === "messages"
          ? simulation.messages
          : query.table?.$table === "handoffs"
            ? (simulation.handoffs ?? [])
            : simulation.threads;
    return rows.filter((row) => matches(query.where, row, simulation)).slice(0, query.limit);
  }
  if (query.table?.$table === "messages") {
    const messages = simulation.messages.filter((row) => matches(query.where, row, simulation));
    return [
      {
        asOf: simulation.asOf,
        maxMessageId: messages
          .reduce(
            (maximum, row) => (BigInt(String(row.id)) > maximum ? BigInt(String(row.id)) : maximum),
            0n,
          )
          .toString(),
      },
    ];
  }
  const order = query.order![0] as unknown[];
  const activityExpression = order[1] as SqlFragment;
  return simulation.threads
    .filter((row) => matches(query.where, row, simulation))
    .map((row) => ({
      ...row,
      snapshotActivity: activity(activityExpression, row, simulation.messages),
    }))
    .sort(
      (left, right) =>
        String(right.snapshotActivity).localeCompare(String(left.snapshotActivity)) ||
        String(right.id).localeCompare(String(left.id)),
    )
    .slice(0, query.limit);
}
function encode(cursor: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function decode(cursor: string) {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}
function cursor(overrides: Record<string, unknown> = {}) {
  return encode({
    v: 1,
    userId: "owner",
    agentId: "",
    accountId: "",
    asOf: AS_OF,
    maxMessageId: "3",
    lastActivity: "2026-09-20T04:00:00.999999Z",
    lastId: IDS[1],
    ...overrides,
  });
}

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
function handler(path: string, source = router, method?: "get"): Handler {
  const layers = (
    source as unknown as {
      stack: Array<{
        route?: { path: string; methods: { get?: boolean }; stack: Array<{ handle: Handler }> };
      }>;
    }
  ).stack;
  return layers
    .find((layer) => layer.route?.path === path && (!method || layer.route.methods[method]))!
    .route!.stack.at(-1)!.handle;
}
async function list(query: Record<string, string> = {}) {
  const json = vi.fn();
  await handler("/api/emails/threads")({ user: { id: "owner" }, query }, { json });
  return json.mock.calls[0][0];
}

async function detail(id: string, query: Record<string, string> = {}) {
  const json = vi.fn();
  await handler(
    "/api/emails/threads/:id/outcome",
    outcomeRouter,
    "get",
  )({ user: { id: "owner" }, params: { id }, query }, { json });
  return json.mock.calls[0][0];
}

beforeEach(() => {
  h.rows = [];
  h.simulation = null;
  h.queries = [];
  h.updates = [];
  h.touchNavCounts.mockReset();
});

describe("email detail follows the selected inbox scope", () => {
  beforeEach(() => {
    h.simulation = {
      asOf: AS_OF,
      accounts: [
        { id: "mailbox-a", userId: "owner", agentId: "current-bot" },
        { id: "mailbox-b", userId: "owner", agentId: "other-bot" },
        { id: "foreign-mailbox", userId: "another-owner", agentId: "foreign-bot" },
      ],
      threads: [
        { id: "older", userId: "owner", accountId: "mailbox-a", agentId: "previous-bot" },
        { id: "foreign", userId: "another-owner", accountId: "mailbox-a" },
        { id: "foreign-mail", userId: "owner", accountId: "foreign-mailbox" },
      ],
      messages: [
        { id: "message", userId: "owner", threadId: "older", content: "Saved conversation" },
        { id: "foreign-message", userId: "another-owner", threadId: "older" },
      ],
      handoffs: [
        {
          id: "handoff",
          userId: "owner",
          sourceId: "older",
          sourceType: "email_thread",
          taskType: "human_handoff",
          status: "pending",
        },
        {
          id: "foreign-handoff",
          userId: "another-owner",
          sourceId: "older",
          sourceType: "email_thread",
          taskType: "human_handoff",
          status: "pending",
        },
      ],
    };
  });

  it.each([
    { agent_id: " current-bot ", account_id: " mailbox-a " },
    { agent_id: "current-bot" },
    { account_id: "mailbox-a" },
  ] as Array<Record<string, string>>)(
    "uses the current mailbox assignment instead of a historical thread Bot: %j",
    async (query) => {
      const result = await detail("older", query);
      expect(result.thread.id).toBe("older");
      expect(result.messages.map((message: TestRow) => message.id)).toEqual(["message"]);
      expect(result.handoff.id).toBe("handoff");
      expect(h.queries.find((query) => query.table?.$table === "threads")?.where).toEqual([
        "and",
        ["eq", "threads.id", "older"],
        ["eq", "threads.userId", "owner"],
        ["inArray", "threads.accountId", ["mailbox-a"]],
      ]);
    },
  );

  it.each([
    ["older", { agent_id: "previous-bot" }],
    ["older", { agent_id: "other-bot", account_id: "mailbox-a" }],
    ["older", { account_id: "mailbox-b" }],
    ["foreign", { account_id: "mailbox-a" }],
    ["foreign-mail", { account_id: "foreign-mailbox" }],
    ["foreign-mail", { agent_id: "foreign-bot" }],
  ] as Array<[string, Record<string, string>]>)(
    "rejects a mismatched or foreign scope before loading messages or handoffs: %s %j",
    async (id, query) => {
      await expect(detail(id, query)).rejects.toMatchObject({ status: 404 });
      expect(
        h.queries.some((query) => ["messages", "handoffs"].includes(String(query.table?.$table))),
      ).toBe(false);
    },
  );

  it("opens an unscoped approval link beyond the first hundred threads without a list read", async () => {
    h.simulation!.threads.unshift(
      ...Array.from({ length: 100 }, (_, index) => ({ id: `new-${index}`, userId: "owner" })),
    );
    const result = await detail("older");
    expect(result.thread.id).toBe("older");
    expect(h.queries.map((query) => query.table?.$table)).toEqual([
      "threads",
      "messages",
      "handoffs",
    ]);
    expect(h.queries[0].limit).toBe(1);
  });
});

describe("tenant-scoped email history pages", () => {
  it("returns a bounded page and a continuation without widening tenant scope", async () => {
    const time = "2026-09-20T04:00:00.999999Z";
    h.rows = [
      [{ asOf: AS_OF, maxMessageId: "9007199254740993" }],
      [
        { id: IDS[0], snapshotActivity: time },
        { id: IDS[1], snapshotActivity: time },
        { id: IDS[2], snapshotActivity: time },
      ],
    ];
    const page = await list({ limit: "2" });
    expect(page.threads).toEqual([{ id: IDS[0] }, { id: IDS[1] }]);
    expect(page.hasMore).toBe(true);
    expect(decode(page.nextCursor)).toMatchObject({
      asOf: AS_OF,
      maxMessageId: "9007199254740993",
      lastActivity: time,
      lastId: IDS[1],
      userId: "owner",
    });
    expect(h.queries[0].where).toEqual(["eq", "messages.userId", "owner"]);
    expect((h.queries[1].where as unknown[])[1]).toEqual(["eq", "threads.userId", "owner"]);
    expect(h.queries[1].limit).toBe(3);
    expect(h.queries[1].offset).toBeUndefined();
  });

  it("bounds hostile page sizes and finishes an empty cursor page", async () => {
    h.rows = [[]];
    expect(await list({ limit: "999999999", cursor: cursor() })).toEqual({
      threads: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(h.queries[0]).toMatchObject({ limit: 101 });
  });

  it("keeps both owner and owned-mailbox predicates on later pages", async () => {
    h.rows = [[{ id: "mailbox", agentId: "bot" }], [{ id: "older", snapshotActivity: AS_OF }]];
    expect(
      await list({
        account_id: "mailbox",
        agent_id: "bot",
        cursor: cursor({ agentId: "bot", accountId: "mailbox" }),
      }),
    ).toEqual({
      threads: [{ id: "older" }],
      hasMore: false,
      nextCursor: null,
    });
    expect(h.queries[0].where).toEqual([
      "and",
      ["eq", "accounts.id", "mailbox"],
      ["eq", "accounts.userId", "owner"],
    ]);
    expect((h.queries[1].where as unknown[])[1]).toEqual([
      "and",
      ["eq", "threads.userId", "owner"],
      ["inArray", "threads.accountId", ["mailbox"]],
    ]);
  });

  it("does not fall back to all mail when a mailbox is unavailable or mismatched", async () => {
    h.rows = [[]];
    expect(await list({ account_id: "foreign" })).toEqual({
      threads: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(h.queries).toHaveLength(1);
    h.queries = [];
    h.rows = [[{ id: "mailbox", agentId: "other-bot" }]];
    expect((await list({ account_id: "mailbox", agent_id: "bot" })).threads).toEqual([]);
    expect(h.queries).toHaveLength(1);
  });

  it("keeps an unseen older thread reachable after live replies and backdated imports move its activity", async () => {
    const createdAt = "2026-09-01T00:00:00.000000Z";
    h.simulation = {
      asOf: AS_OF,
      threads: IDS.slice(0, 3).map((id) => ({ id, userId: "owner", createdAt })),
      messages: [
        { id: "1", userId: "owner", threadId: IDS[0], createdAt: "2026-09-21T04:50:00.000001Z" },
        { id: "2", userId: "owner", threadId: IDS[1], createdAt: "2026-09-21T04:40:00.000002Z" },
        { id: "3", userId: "owner", threadId: IDS[2], createdAt: "2026-09-21T04:30:00.000003Z" },
        {
          id: "999",
          userId: "someone-else",
          threadId: IDS[2],
          createdAt: "2026-09-21T04:59:00.000000Z",
        },
      ],
    };
    const first = await list({ limit: "2" });
    expect(first.threads.map((thread: TestRow) => thread.id)).toEqual(IDS.slice(0, 2));
    expect(decode(first.nextCursor).maxMessageId).toBe("3");
    h.simulation.threads[2].lastMessageAt = "2026-09-21T05:05:00.000000Z";
    h.simulation.messages.push(
      { id: "4", userId: "owner", threadId: IDS[2], createdAt: "2026-09-21T05:05:00.000000Z" },
      { id: "5", userId: "owner", threadId: IDS[2], createdAt: "2026-09-21T04:55:00.000000Z" },
    );
    h.simulation.threads.push({
      id: IDS[3],
      userId: "owner",
      createdAt: "2026-09-21T05:01:00.000000Z",
    });
    h.simulation.asOf = "2026-09-21T05:10:00.000000Z";
    const second = await list({ limit: "2", cursor: first.nextCursor });
    expect(second.threads.map((thread: TestRow) => thread.id)).toEqual([IDS[2]]);
    expect(second.nextCursor).toBeNull();
    const refreshed = await list({ limit: "2" });
    expect(refreshed.threads[0].id).toBe(IDS[2]);
  });

  it.each([
    { asOf: "2026-02-30T00:00:00.000000Z" },
    { asOf: "0000-01-01T00:00:00.000000Z" },
    { asOf: [AS_OF] },
    { lastActivity: "not-a-date" },
    { lastId: [IDS[0]] },
    { maxMessageId: 3 },
    { maxMessageId: "9223372036854775808" },
    { userId: "another-owner" },
    { agentId: "another-bot" },
    { accountId: "another-mailbox" },
  ])(
    "rejects malformed or differently scoped cursor fields before reading data: %j",
    async (invalid) => {
      await expect(list({ cursor: cursor(invalid) })).rejects.toMatchObject({ status: 400 });
      expect(h.queries).toHaveLength(0);
    },
  );

  it("retains same-millisecond rows and orders equal timestamps by UUID", async () => {
    const createdAt = "2026-09-01T00:00:00.000000Z";
    h.simulation = {
      asOf: AS_OF,
      threads: IDS.slice(0, 3).map((id) => ({ id, userId: "owner", createdAt })),
      messages: [
        { id: "1", userId: "owner", threadId: IDS[0], createdAt: "2026-09-21T04:50:00.123999Z" },
        { id: "2", userId: "owner", threadId: IDS[1], createdAt: "2026-09-21T04:50:00.123998Z" },
        { id: "3", userId: "owner", threadId: IDS[2], createdAt: "2026-09-21T04:50:00.123998Z" },
      ],
    };
    const first = await list({ limit: "1" });
    expect(first.threads[0].id).toBe(IDS[0]);
    expect(decode(first.nextCursor).lastActivity).toBe("2026-09-21T04:50:00.123999Z");
    const second = await list({ limit: "1", cursor: first.nextCursor });
    expect(second.threads[0].id).toBe(IDS[2]);
    const third = await list({ limit: "1", cursor: second.nextCursor });
    expect(third.threads[0].id).toBe(IDS[1]);
    expect(third.nextCursor).toBeNull();
  });

  it("rejects invalid cursor encoding before reading data", async () => {
    await expect(list({ cursor: "not-json" })).rejects.toMatchObject({ status: 400 });
    expect(h.queries).toHaveLength(0);
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
