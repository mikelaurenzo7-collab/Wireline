import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRow } from "../src/lib/job-queue";

// Execute the actual base handler against a small relational fake. Predicates and
// joins are evaluated, so omitting a tenant or Bot condition exposes real rows.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Predicate = { column: unknown; value: unknown } | { all: Predicate[] };
  const tables: Record<string, Row[]> = {};
  const inserts: { table: string; values: Row }[] = [];
  const reads: { table: string; where: Predicate }[] = [];
  const qualify = (table: string, row: Row): Row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [`${table}.${key}`, value]));
  const resolve = (value: unknown, row: Row): unknown =>
    typeof value === "string" && /^(calls|agents|settings|jobs|lessons|leads)\./.test(value)
      ? row[value]
      : value;
  const matches = (predicate: Predicate, row: Row): boolean =>
    "all" in predicate
      ? predicate.all.every((condition) => matches(condition, row))
      : resolve(predicate.column, row) === resolve(predicate.value, row);
  const db = {
    select(selection?: Row) {
      let table = "";
      let predicate: Predicate = { all: [] };
      let join: { table: string; predicate: Predicate; required: boolean } | undefined;
      const query = {
        from(value: string) {
          table = value;
          return query;
        },
        innerJoin(value: string, condition: Predicate) {
          join = { table: value, predicate: condition, required: true };
          return query;
        },
        leftJoin(value: string, condition: Predicate) {
          join = { table: value, predicate: condition, required: false };
          return query;
        },
        where(value: Predicate) {
          predicate = value;
          return query;
        },
        async limit(count: number) {
          reads.push({ table, where: predicate });
          return (tables[table] || [])
            .flatMap((raw) => {
              let row = qualify(table, raw);
              if (join) {
                const current = join;
                const joined = (tables[current.table] || []).find((candidate) =>
                  matches(current.predicate, { ...row, ...qualify(current.table, candidate) }),
                );
                if (!joined && current.required) return [];
                if (joined) row = { ...row, ...qualify(current.table, joined) };
              }
              if (!matches(predicate, row)) return [];
              return [
                selection
                  ? Object.fromEntries(
                      Object.entries(selection).map(([key, column]) => [key, resolve(column, row)]),
                    )
                  : raw,
              ];
            })
            .slice(0, count);
        },
      };
      return query;
    },
    insert(table: string) {
      return {
        values(values: Row) {
          inserts.push({ table, values });
          return Object.assign(Promise.resolve(), { onConflictDoNothing: async () => undefined });
        },
      };
    },
    update(table: string) {
      return {
        set(values: Row) {
          return {
            async where(predicate: Predicate) {
              for (const row of tables[table] || []) {
                if (matches(predicate, qualify(table, row))) Object.assign(row, values);
              }
            },
          };
        },
      };
    },
  };
  return {
    tables,
    inserts,
    reads,
    db,
    brainAvailable: vi.fn(),
    lesson: vi.fn(),
    qaScore: vi.fn(),
    apolloReady: vi.fn(),
    searchLeads: vi.fn(),
    enqueue: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  and: (...all: unknown[]) => ({ all }),
  lt: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("../src/db/schema", () => {
  const table = (name: string, columns: string[]) => ({
    [Symbol.toPrimitive]: () => name,
    ...Object.fromEntries(columns.map((column) => [column, `${name}.${column}`])),
  });
  // Primitive coercion preserves table identity in the fake's string-keyed store.
  return {
    callLogs: table("calls", [
      "id",
      "userId",
      "agentId",
      "summary",
      "transcript",
      "sentiment",
      "direction",
      "durationSeconds",
      "qaScore",
      "qaBreakdown",
    ]),
    agents: table("agents", ["id", "userId", "role"]),
    settings: table("settings", ["userId"]),
    jobs: table("jobs", ["id"]),
    agentLessons: table("lessons", ["agentId", "lesson"]),
    outboundLeads: table("leads", []),
  };
});
vi.mock("../src/lib/server-context", () => ({
  drizzle: h.db,
  quotaTracker: {},
  tenantStore: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/ai-brains", () => ({
  isBrainAvailable: h.brainAvailable,
  synthesizeLesson: h.lesson,
  qaScore: h.qaScore,
}));
vi.mock("../src/lib/apollo-service", () => ({
  apolloReadyForUser: h.apolloReady,
  searchLeads: h.searchLeads,
}));
vi.mock("../src/lib/job-queue", () => ({
  enqueue: h.enqueue,
  startWorker: vi.fn(),
  writeTransactionConfig: {},
}));
vi.mock("../src/lib/ai-audit", () => ({}));
vi.mock("../src/lib/post-call-analysis-policy", () => ({}));
vi.mock("../src/lib/server-utils", () => ({}));
vi.mock("../src/lib/action-engine", () => ({}));
vi.mock("../src/lib/action-types", () => ({}));
vi.mock("../src/lib/post-call-follow-up", () => ({}));
vi.mock("../src/lib/agent-runtime-helpers", () => ({}));
vi.mock("../src/middleware/audit-middleware", () => ({}));
vi.mock("../src/lib/webhook-helpers", () => ({}));
vi.mock("../src/lib/crm-service", () => ({}));
vi.mock("../src/lib/account-deletion", () => ({}));
vi.mock("../src/lib/account-deletion-fence", () => ({}));
vi.mock("../src/lib/app-url", () => ({}));

import { handleJob } from "../src/lib/job-worker-base";
import { JobOwnerError } from "../src/lib/job-owner";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const adaptive = { agentId: "bot-one", callId: "42", score: 25, breakdown: {} };
function claimed(
  type: string,
  payload: unknown,
  row: Record<string, unknown> = { userId: owner },
): JobRow {
  // Drizzle claim().returning() supplies camelCase; the original raw shape does not.
  return { id: "job-one", type, payload, ...row } as JobRow;
}

describe("job handler tenant ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(h.tables)) delete h.tables[key];
    h.inserts.length = 0;
    h.reads.length = 0;
    h.tables.calls = [
      {
        id: 42n,
        userId: owner,
        agentId: "bot-one",
        transcript: "A completed business call.",
        durationSeconds: 60,
        qaBreakdown: { source: "heuristic" },
      },
    ];
    h.tables.agents = [{ id: "bot-one", userId: owner, role: "receptionist" }];
    h.tables.settings = [{ userId: owner, prospectingEnabled: true }];
    h.tables.jobs = [{ id: "job-one" }];
    h.brainAvailable.mockReturnValue(true);
    h.lesson.mockResolvedValue("Ask one clear follow-up question.");
    h.qaScore.mockResolvedValue({
      greeting: 5,
      discovery: 5,
      solution: 5,
      objection: 5,
      closing: 5,
    });
    h.apolloReady.mockResolvedValue(true);
    h.searchLeads.mockResolvedValue([
      { first_name: "Test", last_name: "Lead", phone: "+13125550100", apollo_id: "lead-one" },
    ]);
    h.enqueue.mockResolvedValue({ ok: true });
  });

  it.each([{ userId: owner }, { user_id: owner }])(
    "runs Lead Hunt for a claimed or legacy row without relying on payload: %j",
    async (row) => {
      await handleJob(claimed("autonomous_prospecting", {}, row));
      expect(h.apolloReady).toHaveBeenCalledWith(owner);
      expect(h.searchLeads).toHaveBeenCalledWith(expect.any(Object), owner);
      expect(h.inserts).toEqual([
        expect.objectContaining({
          values: expect.objectContaining({
            userId: owner,
            source: "apollo",
            metadata: expect.objectContaining({ has_express_written_consent: false }),
          }),
        }),
      ]);
      expect(h.tables.jobs[0].result).toMatchObject({ leadsAdded: 1, reviewPending: 1 });
    },
  );

  it.each([
    claimed("autonomous_prospecting", { userId: other }),
    claimed("autonomous_prospecting", { userId: owner }, {}),
    claimed("autonomous_prospecting", {}, { userId: owner, user_id: other }),
  ])("rejects unsafe Lead Hunt row/payload ownership before Apollo or storage", async (job) => {
    await expect(handleJob(job)).rejects.toBeInstanceOf(JobOwnerError);
    expect(h.apolloReady).not.toHaveBeenCalled();
    expect(h.inserts).toEqual([]);
    expect(h.reads).toEqual([]);
  });

  it.each([{ userId: owner }, { user_id: owner }])(
    "synthesizes for the immutable row owner when legacy payload omits it: %j",
    async (row) => {
      await handleJob(claimed("adaptive_optimization", adaptive, row));
      expect(h.lesson).toHaveBeenCalledTimes(1);
      expect(h.inserts).toEqual([
        {
          table: expect.anything(),
          values: expect.objectContaining({
            userId: owner,
            agentId: "bot-one",
            sourceCallId: "42",
          }),
        },
      ]);
    },
  );

  it.each([
    { payload: { ...adaptive, userId: other }, row: { userId: owner } },
    { payload: { ...adaptive, userId: owner }, row: {} },
    { payload: adaptive, row: { userId: owner, user_id: other } },
  ])("rejects owner mismatch/missing/conflict before paid synthesis", async ({ payload, row }) => {
    await expect(handleJob(claimed("adaptive_optimization", payload, row))).rejects.toBeInstanceOf(
      JobOwnerError,
    );
    expect(h.lesson).not.toHaveBeenCalled();
    expect(h.reads).toEqual([]);
  });

  it.each(["foreign-call", "foreign-bot", "deleted-bot", "different-bot"])(
    "skips paid synthesis for %s",
    async (scenario) => {
      if (scenario === "foreign-call") h.tables.calls[0].userId = other;
      if (scenario === "foreign-bot") h.tables.agents[0].userId = other;
      if (scenario === "deleted-bot") h.tables.agents = [];
      if (scenario === "different-bot") h.tables.calls[0].agentId = "bot-other";
      await handleJob(claimed("adaptive_optimization", adaptive));
      expect(h.lesson).not.toHaveBeenCalled();
      expect(h.inserts).toEqual([]);
    },
  );

  it.each([
    { callId: "bad" },
    { callId: "0" },
    { callId: "9223372036854775808" },
    { score: NaN },
    { score: 101 },
    { agentId: "" },
  ])("rejects malformed adaptive identity or score: %j", async (invalid) => {
    await expect(
      handleJob(claimed("adaptive_optimization", { ...adaptive, ...invalid })),
    ).rejects.toThrow("invalid call or Bot identity");
    expect(h.lesson).not.toHaveBeenCalled();
    expect(h.reads).toEqual([]);
  });

  it("carries the claimed owner through real QA production and adaptive consumption", async () => {
    await handleJob(claimed("auto_qa_score", { callLogId: "42" }));
    expect(h.qaScore).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledWith(
      h.db,
      expect.objectContaining({
        userId: owner,
        type: "adaptive_optimization",
        payload: expect.objectContaining({
          userId: owner,
          callId: "42",
          agentId: "bot-one",
          score: 25,
        }),
      }),
    );
    const produced = h.enqueue.mock.calls[0][1];
    await handleJob(claimed(produced.type, produced.payload, { userId: produced.userId }));
    expect(h.lesson).toHaveBeenCalledTimes(1);
    expect(h.inserts[0].values.userId).toBe(owner);
    expect(h.tables.calls[0].qaBreakdown).toMatchObject({ source: "rubric" });
  });

  it("does not score another tenant's call or emit a follow-up job", async () => {
    h.tables.calls[0].userId = other;
    await handleJob(claimed("auto_qa_score", { callLogId: "42", userId: owner }));
    expect(h.qaScore).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
  });
});
