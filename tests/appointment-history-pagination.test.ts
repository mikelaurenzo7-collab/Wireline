import { beforeEach, describe, expect, it, vi } from "vitest";

type SqlFragment = { parts: string[]; values: unknown[] };
type Row = { id: string; userId: string; createdAt: string | null; status?: string };
type Query = {
  columns?: Record<string, unknown>;
  where?: unknown;
  order?: unknown[];
  limit?: number;
};
const epoch = "1970-01-01T00:00:00.000000Z";
const ids = [1, 2, 3, 4, 5].map(
  (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
);
const h = vi.hoisted(() => ({ rows: [] as Row[], queries: [] as Query[] }));

vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  auditLogger: {},
  serialQueryBatch: vi.fn(),
  drizzle: {
    select(columns?: Record<string, unknown>) {
      const query: Query = { columns };
      h.queries.push(query);
      const builder = {
        from: () => builder,
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
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(execute(query)).then(resolve);
        },
      };
      return builder;
    },
  },
}));
vi.mock("../src/db/schema", () => ({
  appointments: { id: "id", userId: "userId", createdAt: "createdAt" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (left: unknown, right: unknown) => ["eq", left, right],
  and: (...values: unknown[]) => ["and", ...values],
  desc: (column: unknown) => ["desc", column],
  lt: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
    parts: Array.from(parts),
    values,
  }),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ dashboardRateLimit: vi.fn() }));
vi.mock("../src/lib/dashboard-stats", () => ({ computeDashboardStats: vi.fn() }));
vi.mock("../src/lib/dashboard-cache", () => ({
  getCachedDashboard: vi.fn(),
  setCachedDashboard: vi.fn(),
  invalidateDashboard: vi.fn(),
}));
vi.mock("../src/lib/nav-counts-cache", () => ({
  getCachedNavCounts: vi.fn(),
  setCachedNavCounts: vi.fn(),
}));
vi.mock("../src/lib/server-utils", () => ({
  getErrorMessage: String,
  mapObjectToSnake: (value: unknown) => value,
}));

import router from "../src/routes/dashboard-routes";

function matches(condition: unknown, row: Row): boolean {
  if (condition === undefined) return true;
  if (Array.isArray(condition)) {
    if (condition[0] === "and") return condition.slice(1).every((part) => matches(part, row));
    if (condition[0] === "eq") return row[condition[1] as keyof Row] === condition[2];
  }
  const fragment = condition as SqlFragment;
  expect(fragment.parts.join("?")).toContain(") < (");
  expect(fragment.values.slice(0, 2)).toEqual(["createdAt", "id"]);
  const [time, id] = fragment.values.slice(2) as string[];
  const current = row.createdAt ?? epoch;
  return current < time || (current === time && row.id < id);
}
function execute(query: Query) {
  const rows = h.rows.filter((row) => matches(query.where, row));
  if (query.columns?.count) return [{ count: rows.length }];
  if (query.columns?.createdAt) {
    const timestamp = query.columns.createdAt as SqlFragment;
    expect(timestamp.parts.join("?")).toContain('HH24:MI:SS.US"Z"');
    return rows
      .slice(0, query.limit)
      .map((row) => ({ id: row.id, createdAt: row.createdAt ?? epoch }));
  }
  expect(query.order?.[1]).toEqual(["desc", "id"]);
  const timeOrder = query.order?.[0] as unknown[];
  expect(timeOrder[0]).toBe("desc");
  expect((timeOrder[1] as SqlFragment).values).toEqual(["createdAt"]);
  return rows
    .sort(
      (left, right) =>
        (right.createdAt ?? epoch).localeCompare(left.createdAt ?? epoch) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, query.limit);
}
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
async function list(query: Record<string, unknown> = {}) {
  const layers = (
    router as unknown as {
      stack: Array<{ route?: { path: string; stack: Array<{ handle: Handler }> } }>;
    }
  ).stack;
  const handler = layers
    .find((layer) => layer.route?.path === "/api/appointments")!
    .route!.stack.at(-1)!.handle;
  const json = vi.fn();
  await handler({ user: { id: "owner" }, query }, { json });
  return json.mock.calls[0][0];
}
beforeEach(() => {
  h.queries = [];
  h.rows = [
    { id: ids[0], userId: "owner", createdAt: "2026-09-21T04:50:00.123999Z" },
    { id: ids[1], userId: "owner", createdAt: "2026-09-21T04:50:00.123998Z" },
    { id: ids[2], userId: "owner", createdAt: "2026-09-21T04:50:00.123998Z" },
    { id: ids[3], userId: "other", createdAt: "2026-09-21T05:00:00.000000Z" },
  ];
});

describe("owned appointment history cursor", () => {
  it("returns a bounded latest-created page with a stable continuation", async () => {
    const result = await list({ limit: "1" });
    expect(result.appointments.map((row: Row) => row.id)).toEqual([ids[0]]);
    expect(result).toMatchObject({ total: 3, hasMore: true, nextCursor: ids[0] });
    expect(h.queries[1].limit).toBe(2);
    expect(h.queries[1].where).toEqual(["and", ["eq", "userId", "owner"], undefined]);
  });

  it("does not skip older rows after arrivals or status changes and preserves microsecond ties", async () => {
    const first = await list({ limit: "1" });
    h.rows.push({ id: ids[4], userId: "owner", createdAt: "2026-09-21T06:00:00.000000Z" });
    h.rows[1].status = "Cancelled";
    const second = await list({ limit: "1", cursor: first.nextCursor });
    expect(second.appointments.map((row: Row) => row.id)).toEqual([ids[2]]);
    const third = await list({ limit: "1", cursor: second.nextCursor });
    expect(third.appointments.map((row: Row) => row.id)).toEqual([ids[1]]);
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
    expect(h.queries[2].where).toEqual(["and", ["eq", "userId", "owner"], ["eq", "id", ids[0]]]);
    const predicate = (h.queries[4].where as unknown[])[2] as SqlFragment;
    expect(predicate.values.slice(2)).toEqual(["2026-09-21T04:50:00.123999Z", ids[0]]);
  });

  it("retains deterministic access to legacy null-created records", async () => {
    h.rows = [
      { id: ids[0], userId: "owner", createdAt: null },
      { id: ids[1], userId: "owner", createdAt: null },
    ];
    const first = await list({ limit: "1" });
    const last = await list({ limit: "1", cursor: first.nextCursor });
    expect(first.appointments[0].id).toBe(ids[1]);
    expect(last.appointments[0].id).toBe(ids[0]);
    expect(last.nextCursor).toBeNull();
  });

  it.each([ids[3], ids[4]])("requires an existing owned cursor row: %s", async (cursor) => {
    await expect(list({ cursor })).rejects.toMatchObject({
      status: 404,
      code: "APPOINTMENT_CURSOR_EXPIRED",
    });
    expect(h.queries).toHaveLength(1);
  });

  it.each(["invalid", "", [ids[0]]])(
    "rejects malformed cursors before queries: %j",
    async (cursor) => {
      await expect(list({ cursor })).rejects.toMatchObject({ status: 400 });
      expect(h.queries).toHaveLength(0);
    },
  );

  it("caps the requested page and rejects unsafe legacy offsets", async () => {
    await list({ limit: "999999" });
    expect(h.queries[1].limit).toBe(1001);
    await expect(list({ offset: "100" })).rejects.toMatchObject({ status: 400 });
  });
});
