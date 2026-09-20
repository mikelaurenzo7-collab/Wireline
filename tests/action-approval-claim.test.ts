import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionItem } from "../src/lib/action-types";

type Row = Record<string, any>;
const h = vi.hoisted(() => ({ task: {} as Row, records: [] as Row[], inTransaction: false }));
vi.mock("../src/lib/server-context", async () => {
  const schema = await import("../src/db/schema");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  let queue = Promise.resolve();
  const db = {
    select: () => {
      let table: unknown;
      let condition: any;
      const query = {
        from: (value: unknown) => {
          table = value;
          return query;
        },
        where: (value: unknown) => {
          condition = value;
          return query;
        },
        limit: () => query,
        orderBy: () => query,
        for: () => query,
        then: (resolve: (rows: Row[]) => unknown) => {
          const compiled = dialect.sqlToQuery(condition);
          expect(compiled.params).toContain("tenant");
          let rows = table === schema.followUpTasks ? [{ ...h.task }] : h.records;
          if (compiled.sql.includes("approvalTaskIds")) {
            rows = rows.filter(
              (row) =>
                row.metadata.approvalTaskIds?.includes(h.task.id) &&
                (row.metadata.status === "processing" ||
                  (row.metadata.status === "completed" && row.metadata.output?.queued !== true)),
            );
          }
          return Promise.resolve(rows).then(resolve);
        },
      };
      return query;
    },
    insert: () => ({
      values: (row: Row) => ({
        returning: async () => {
          h.records.push({ id: 1n, ...row });
          return [{ id: 1n }];
        },
      }),
    }),
    update: () => ({
      set: (patch: Row) => ({
        where: async () => {
          if (patch.metadata?.queryChunks) {
            const query = dialect.sqlToQuery(patch.metadata);
            expect(query.sql).toContain('"wireline_audit_log"."metadata"');
            h.records[0].metadata = {
              ...h.records[0].metadata,
              ...JSON.parse(String(query.params[0])),
            };
          } else Object.assign(h.records[0], patch);
        },
      }),
    }),
    execute: async () => [],
    transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      h.inTransaction = true;
      try {
        return await operation(db);
      } finally {
        h.inTransaction = false;
        release();
      }
    },
  };
  return { drizzle: db, log: { error: vi.fn(), warn: vi.fn() } };
});

import { drizzle } from "../src/lib/server-context";
import {
  assertTaskCanBeEdited,
  runIdempotentActionExecution,
} from "../src/lib/action-execution-idempotency";

const action: ActionItem = {
  type: "send_email",
  priority: "medium",
  payload: { to: "test@example.test", body: "Reviewed copy" },
};
const input = {
  userId: "tenant",
  action,
  sourceId: "task",
  sourceType: "manual_approval",
  phase: "auto" as const,
  approvalTask: { id: "task", action },
};
beforeEach(() => {
  h.task = {
    id: "task",
    userId: "tenant",
    status: "pending",
    taskType: action.type,
    priority: action.priority,
    payload: action.payload,
    agentId: null,
    sourceId: null,
    sourceType: null,
  };
  h.records = [];
  h.inTransaction = false;
});

describe("task approval at the durable action boundary", () => {
  it("lets an operator edit a cached draft because nothing was sent", async () => {
    await runIdempotentActionExecution({
      ...input,
      execute: async () => ({ success: true, queued: true }),
    });
    await expect(
      drizzle.transaction((tx) => assertTaskCanBeEdited(tx, "tenant", "task")),
    ).resolves.toBeUndefined();
  });

  it("serializes concurrent approvals of a previously queued draft", async () => {
    await runIdempotentActionExecution({
      ...input,
      approvalTask: undefined,
      execute: async () => ({ success: true, queued: true }),
    });
    let finish!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const finishPromise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const execute = vi.fn(async () => {
      started();
      await finishPromise;
      return { success: true };
    });
    const first = runIdempotentActionExecution({ ...input, execute });
    await startedPromise;
    const second = await runIdempotentActionExecution({ ...input, execute });
    expect(second.success).toBe(false);
    finish();
    expect((await first).success).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("executes a previously queued autonomous draft only once after explicit approval", async () => {
    await runIdempotentActionExecution({
      ...input,
      approvalTask: undefined,
      execute: async () => ({ success: true, queued: true }),
    });
    const execute = vi.fn(async () => ({ success: true }));
    await runIdempotentActionExecution({ ...input, execute });
    await runIdempotentActionExecution({ ...input, execute });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.records[0].metadata.output).toEqual({ success: true });
  });

  it("preserves a blocked approval's actionable error code on retry", async () => {
    const execute = vi.fn(async () => ({
      success: false,
      errorCode: "COMMUNICATION_BLOCKED",
      error: "Edit this email.",
    }));
    await runIdempotentActionExecution({ ...input, execute });
    expect(await runIdempotentActionExecution({ ...input, execute })).toMatchObject({
      errorCode: "COMMUNICATION_BLOCKED",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects cancellation that wins after the route read but before the action claim", async () => {
    h.task.status = "cancelled";
    const execute = vi.fn(async () => ({ success: true }));
    expect(await runIdempotentActionExecution({ ...input, execute })).toMatchObject({
      success: false,
      errorCode: "TASK_CHANGED",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
  });

  it("rejects a stale approval after another session edits the payload", async () => {
    h.task.payload = { ...action.payload, body: "New copy" };
    const execute = vi.fn(async () => ({ success: true }));
    expect(await runIdempotentActionExecution({ ...input, execute })).toMatchObject({
      errorCode: "TASK_CHANGED",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks cancellation during provider work and preserves its claim after completion", async () => {
    let finish!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const finishPromise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const execution = runIdempotentActionExecution({
      ...input,
      execute: async () => {
        expect(h.inTransaction).toBe(false);
        started();
        await finishPromise;
        return { success: true };
      },
    });
    await startedPromise;
    await expect(
      drizzle.transaction((tx) => assertTaskCanBeEdited(tx, "tenant", "task")),
    ).rejects.toMatchObject({ status: 409, code: "TASK_APPROVAL_STARTED" });
    finish();
    expect(await execution).toMatchObject({ success: true });
    expect(h.records[0].metadata).toMatchObject({ status: "completed", approvalTaskIds: ["task"] });
    await expect(
      drizzle.transaction((tx) => assertTaskCanBeEdited(tx, "tenant", "task")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("recovers a completed action without another provider invocation", async () => {
    const execute = vi.fn(async () => ({ success: true }));
    await runIdempotentActionExecution({ ...input, execute });
    await runIdempotentActionExecution({ ...input, execute });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("allows edits after a settled failed action", async () => {
    await runIdempotentActionExecution({
      ...input,
      execute: async () => ({ success: false, error: "Rejected" }),
    });
    await expect(
      drizzle.transaction((tx) => assertTaskCanBeEdited(tx, "tenant", "task")),
    ).resolves.toBeUndefined();
  });
});
