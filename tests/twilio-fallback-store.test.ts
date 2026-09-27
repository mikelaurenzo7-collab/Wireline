import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import type { FallbackReceipt } from "../src/lib/voice/twilio-fallback-receipt";

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({ OPENAI_SIP_PROVIDER_MAX_SECONDS: 3600 }));
vi.mock("../src/lib/inbound-concurrency", () => ({ inboundConcurrentCallCeiling: () => 10 }));
import { twilioFallbackStore } from "../src/lib/voice/twilio-fallback-store";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const parentCallSid = `CA${"1".repeat(32)}`;
const childCallSid = `CA${"2".repeat(32)}`;
const receipt: FallbackReceipt = {
  userId: owner,
  parentCallSid,
  calledNumber: "+12025550140",
  callerNumber: "+12025550141",
  fallbackNumber: "+12025550142",
  agentId: "bot-1",
  maxSeconds: 60,
  leaseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  leaseExpiresAt: "2026-12-01T00:00:00Z",
  completion: null,
};
const row = { userId: owner, agentId: "bot-1", customerNumber: receipt.callerNumber };
const admission = {
  metadata: {
    calledNumber: receipt.calledNumber,
    fallbackNumber: receipt.fallbackNumber,
    maxSeconds: 60,
    leaseId: receipt.leaseId,
    leaseExpiresAt: receipt.leaseExpiresAt,
  },
};

function database(results: unknown[][]) {
  const values: Array<{ table: string; value: any }> = [];
  const predicates: string[] = [];
  const locks: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const dialect = new PgDialect();
  const db: any = {
    select: vi.fn(() => {
      const result = results.shift() ?? [];
      const q: any = {
        from: () => q,
        where: (sql: any) => {
          predicates.push(JSON.stringify(dialect.sqlToQuery(sql)));
          return q;
        },
        limit: () => q,
        for: (mode: string) => {
          locks.push(mode);
          return q;
        },
        then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return q;
    }),
    execute: vi.fn(async () => []),
    insert: vi.fn((table) => {
      const q: any = {
        values: (value: unknown) => {
          values.push({ table: getTableName(table), value });
          return q;
        },
        onConflictDoNothing: () => q,
        returning: async () => [{ id: 1n }],
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
      };
      return q;
    }),
    update: vi.fn(() => ({
      set: (value: Record<string, unknown>) => {
        updates.push(value);
        return { where: async () => [] };
      },
    })),
    delete: vi.fn((table) => {
      deleted.push(getTableName(table));
      return { where: async () => [] };
    }),
    transaction: vi.fn(async (operation: (tx: any) => unknown) => operation(db)),
  };
  h.db = db;
  return { db, values, predicates, locks, updates, deleted };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fallback durable receipt repository", () => {
  it("claims an exact line under lock and persists admission with pending presence atomically", async () => {
    const d = database([[{ agentId: "bot-1" }], [], [{ live: "0" }]]);
    const { completion: _completion, ...input } = receipt;
    await expect(twilioFallbackStore.claim(input)).resolves.toEqual(receipt);
    expect(d.db.transaction).toHaveBeenCalledOnce();
    expect(d.db.execute).toHaveBeenCalledOnce();
    expect(d.locks).toEqual(["update", "update"]);
    expect(d.predicates[0]).toContain(owner);
    expect(d.predicates[0]).toContain(receipt.calledNumber);
    expect(d.values.map((item) => item.table)).toEqual([
      "wireline_call_logs",
      "wireline_audit_log",
      "wireline_signal_presence",
    ]);
    expect(d.values[0].value.durationSeconds).toBeUndefined();
    expect(d.values[0].value.endedReason).toBeUndefined();
    expect(d.values[1].value.metadata).toEqual(admission.metadata);
  });

  it("does not create spend after the line is released or capacity is full", async () => {
    const { completion: _completion, ...input } = receipt;
    for (const rows of [[], [{ agentId: "another-bot" }]]) {
      const d = database([rows]);
      expect(await twilioFallbackStore.claim(input)).toBeNull();
      expect(d.values).toEqual([]);
    }
    const d = database([[{ agentId: "bot-1" }], [], [{ live: "10" }]]);
    expect(await twilioFallbackStore.claim(input)).toBeNull();
    expect(d.values).toEqual([]);
  });

  it("preserves actual overrun while creating one explicit provider incident and ending presence", async () => {
    const d = database([[row], [admission], []]);
    const completion = { childCallSid, status: "completed", durationSeconds: 70 };
    expect(await twilioFallbackStore.complete(receipt, completion)).toEqual(completion);
    expect(d.locks).toEqual(["update"]);
    expect(d.predicates.every((value) => value.includes(owner))).toBe(true);
    expect(d.values.map((value) => value.value.action)).toEqual([
      "voice.fallback.completed",
      "voice.fallback.duration_overrun",
    ]);
    expect(d.values[1].value.metadata).toMatchObject({
      actualSeconds: 70,
      admittedSeconds: 60,
      customerMeteredSeconds: 60,
      reconciliationRequired: true,
    });
    expect(d.updates[0]).toMatchObject({ durationSeconds: 70, endedReason: "fallback-completed" });
    expect(d.deleted).toEqual(["wireline_signal_presence"]);
  });

  it("replays the same terminal receipt without another write, rejecting a different child", async () => {
    const completion = { childCallSid, status: "completed", durationSeconds: 60 };
    const d = database([[row], [admission], [{ metadata: completion }]]);
    expect(await twilioFallbackStore.complete(receipt, completion)).toEqual(completion);
    expect(d.values).toEqual([]);
    database([[row], [admission], [{ metadata: completion }]]);
    await expect(
      twilioFallbackStore.complete(receipt, { ...completion, childCallSid: `CA${"3".repeat(32)}` }),
    ).rejects.toThrow("conflicts");
  });
});
