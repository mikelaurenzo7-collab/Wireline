import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tasks: new Map<string, Record<string, any>>(),
  receipts: new Map<string, Record<string, any>>(),
  failWrites: 0,
  failReceipts: 0,
  beforeWrite: null as (() => void | Promise<void>) | null,
  providerStarted: vi.fn(),
}));

vi.mock("../src/lib/server-context", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const camel = (name: string) =>
    name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const query = (kind: "select" | "update" | "insert", selection?: Record<string, any>) => {
    let table: Parameters<typeof getTableName>[0];
    let condition = { sql: "", params: [] as unknown[] };
    let patch: Record<string, any> = {};
    let returning: Record<string, any> | undefined;
    const matches = (row: Record<string, any>) => {
      const recoverySelection = condition.sql.includes("->>'phase' = 'admitted'");
      const active = ["running", "needs_input"].includes(row.status);
      for (const match of condition.sql.matchAll(/"(id|user_id|updated_at)"\s*(=|<)\s*\$(\d+)/g)) {
        const value = condition.params[Number(match[3]) - 1];
        const actual = row[camel(match[1])];
        if (match[2] === "=" && actual !== value) return false;
        if (
          match[2] === "<" &&
          !(recoverySelection && !active) &&
          !(new Date(actual).getTime() < new Date(String(value)).getTime())
        )
          return false;
      }
      if (!recoverySelection && /"status" in \(/i.test(condition.sql) && !active) return false;
      if (!recoverySelection && /"status" NOT IN \(/.test(condition.sql) && active) return false;
      if (
        condition.sql.includes('"finished_at" IS NOT NULL') &&
        !row.finishedAt &&
        !(recoverySelection && active)
      )
        return false;
      if (
        condition.sql.includes("->>'phase' = 'admitted'") &&
        row.usageReceipt?.phase !== "admitted"
      )
        return false;
      if (
        condition.sql.includes("->>'phase' IS DISTINCT FROM 'admitted'") &&
        row.usageReceipt?.phase === "admitted"
      )
        return false;
      if (condition.sql.includes('"usage_receipt" IS NOT NULL') && !row.usageReceipt) return false;
      const receiptGuard = condition.sql.match(
        /"usage_receipt" IS NOT DISTINCT FROM \$(\d+)::jsonb/,
      );
      if (receiptGuard) {
        const expected = condition.params[Number(receiptGuard[1]) - 1];
        if (JSON.stringify(row.usageReceipt) !== (expected ?? "null")) return false;
      }
      if (
        condition.sql.includes("NOT EXISTS") &&
        h.receipts.has(`usage:computer_minutes:computer_task:${row.id}`)
      )
        return false;
      return true;
    };
    const project = (row: Record<string, any>, fields?: Record<string, any>) =>
      fields
        ? Object.fromEntries(
            Object.entries(fields).map(([key, field]) => [key, row[camel(field.name)]]),
          )
        : { ...row };
    const chain = {
      from: (value: typeof table) => {
        table = value;
        return chain;
      },
      table: (value: typeof table) => {
        table = value;
        return chain;
      },
      where: (value: Parameters<typeof dialect.sqlToQuery>[0]) => {
        condition = dialect.sqlToQuery(value);
        return chain;
      },
      orderBy: () => chain,
      limit: () => chain,
      set: (value: Record<string, any>) => {
        patch = value;
        return chain;
      },
      values: (value: Record<string, any>) => {
        patch = value;
        return chain;
      },
      onConflictDoNothing: () => chain,
      returning: (value?: Record<string, any>) => {
        returning = value;
        return chain;
      },
      then: (resolve: (rows: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(async () => {
            const name = getTableName(table);
            if (kind === "insert" && name === "wireline_usage_meter_events") {
              if (h.failReceipts-- > 0) throw new Error("Receipt storage unavailable");
              if (h.receipts.has(patch.idempotencyKey)) return [];
              h.receipts.set(patch.idempotencyKey, { ...patch });
              return [{ id: "receipt-1" }];
            }
            if (name !== "wireline_computer_tasks") return [];
            if (kind === "insert") {
              const row = {
                id: "c745f1df-7f7d-43c4-974e-36a9af943c34",
                events: [],
                sources: [],
                summary: null,
                question: null,
                errorCode: null,
                turnCount: 0,
                actionCount: 0,
                finishedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...patch,
              };
              h.tasks.set(row.id, row);
              return [project(row, returning)];
            }
            if (kind === "update") {
              const race = h.beforeWrite;
              h.beforeWrite = null;
              await race?.();
              if (h.failWrites-- > 0) throw new Error("Task storage unavailable");
            }
            const rows = [...h.tasks.values()].filter(matches);
            if (kind === "select") return rows.map((row) => project(row, selection));
            return rows.map((row) => {
              Object.assign(row, patch);
              return project(row, returning);
            });
          })
          .then(resolve, reject),
    };
    return chain;
  };
  return {
    drizzle: {
      select: (selection?: Record<string, any>) => query("select", selection),
      update: (table: Parameters<typeof getTableName>[0]) => query("update").table(table),
      insert: (table: Parameters<typeof getTableName>[0]) => query("insert").table(table),
      execute: async () => ({ rows: [{ ready: true }] }),
    },
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    tenantStore: { run: (_id: string, operation: () => unknown) => operation() },
  };
});
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  getTenantChannelEntitlements: async () => ({ planId: "usage", subscriptionStatus: "active" }),
}));
vi.mock("../src/lib/mcp-agent-coaching", () => ({
  getAgentCoachingBrief: async () => ({
    agent_id: "agent-owned",
    agent_name: "Review",
    role: "Research",
    training_facts: [],
    operating_rules: [],
  }),
}));
vi.mock("../src/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("../src/lib/managed-ai-operation-spend", () => ({
  runWithManagedAiSpend: () => {
    h.providerStarted();
    return new Promise(() => {});
  },
}));
vi.mock("../src/lib/cloud-computer/config", () => ({
  cloudComputerReadiness: () => ({ available: true }),
  cloudComputerConnection: () => ({ endpoint: "wss://synthetic.invalid" }),
  cloudComputerProcessCapacity: () => 2,
  cloudComputerModel: () => "synthetic",
  cloudComputerClient: vi.fn(),
}));
vi.mock("../src/lib/usage-billing-store", async (original) => ({
  ...(await original<typeof import("../src/lib/usage-billing-store")>()),
  admitAccountUsage: async () => ({
    maxUnits: 60,
    periodKey: "sub_original:pe:2026-11-01T00:00:00.000Z",
  }),
}));

import {
  __resetCloudComputerRunnerForTests,
  getComputerTask,
  interruptCloudComputerTasks,
  startComputerTask,
  stopComputerTask,
  takeComputerControl,
  waitForComputerOwner,
} from "../src/lib/cloud-computer/task-runner";
import {
  reconcileUsageReceipts,
  recordSettledUsageReceipt,
  type DurableUsageReceipt,
} from "../src/lib/usage-billing-store";
import { computerUsageCheckpoint } from "../src/lib/cloud-computer/usage-receipts";

type LiveTask = NonNullable<Parameters<typeof __resetCloudComputerRunnerForTests>[0]>[number];
const ID = "c745f1df-7f7d-43c4-974e-36a9af943c34";
const USER = "d20e5116-9ee3-4fa4-96e1-a2e82352a553";
const PERIOD = "sub_original:pe:2026-11-01T00:00:00.000Z";
const KEY = `usage:computer_minutes:computer_task:${ID}`;
const NOW = new Date("2026-11-02T12:00:00.000Z");

async function flushWrites() {
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
}

function fixture({ stale = false, legacy = false } = {}) {
  const start = new Date(NOW.getTime() - 15 * 60_000);
  const observed = new Date(NOW.getTime() - (stale ? 10 * 60_000 : 30_000));
  const row = {
    id: ID,
    userId: USER,
    agentId: "agent-owned",
    goal: "Inspect the public page",
    startUrl: null,
    status: "running",
    summary: null,
    question: null,
    sources: [],
    events: [],
    errorCode: null,
    turnCount: 1,
    actionCount: 1,
    startedAt: start,
    finishedAt: null,
    createdAt: start,
    updatedAt: observed,
    usageReceipt: legacy
      ? null
      : computerUsageCheckpoint(
          PERIOD,
          start.getTime(),
          observed.getTime(),
          60 * 60_000,
          "admitted",
        ),
  };
  h.tasks.set(ID, row);
  return row;
}

function liveFixture(row: ReturnType<typeof fixture>): LiveTask {
  return {
    taskId: ID,
    userId: USER,
    agentId: "agent-owned",
    startedAt: row.startedAt.getTime(),
    usageMetered: true,
    usagePeriodKey: PERIOD,
    stop: false,
    expiredBrowser: false,
    stopAt: null,
    session: null,
    frame: null,
    frameAt: Date.now(),
    frameUrl: null,
    currentUrl: null,
    ownerFrameRefresh: null,
    ownerFrameEpoch: 0,
    agentPointer: null,
    events: [],
    turns: 1,
    actions: 1,
    reply: null,
    ownerControl: false,
    controlRequested: false,
    controlRequestSaving: false,
    handoffBusy: false,
    preparingBrowser: false,
    handoffGoal: null,
    ownerInputBusy: false,
    finished: false,
    outcome: null,
    outcomeSaved: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.tasks.clear();
  h.receipts.clear();
  h.failWrites = 0;
  h.failReceipts = 0;
  h.beforeWrite = null;
  h.providerStarted.mockReset();
  __resetCloudComputerRunnerForTests();
});
afterEach(() => {
  __resetCloudComputerRunnerForTests();
  vi.useRealTimers();
});

describe("Computer billing across process boundaries", () => {
  it("persists the original admission before provider work and does not bill a live checkpoint", async () => {
    h.providerStarted.mockImplementation(() => {
      expect(h.tasks.get(ID)?.usageReceipt).toEqual({
        periodKey: PERIOD,
        observedQuantity: 0,
        occurredAt: NOW.toISOString(),
        phase: "admitted",
      });
    });
    await startComputerTask(USER, "agent-owned", { goal: "Inspect the public page" });
    expect(h.providerStarted).toHaveBeenCalledOnce();
    await reconcileUsageReceipts();
    expect(h.receipts.size).toBe(0);
    expect(h.tasks.get(ID)?.status).toBe("running");
  });

  it("saves observed usage at an owner checkpoint before another process stops the task", async () => {
    const row = fixture();
    const task = liveFixture(row);
    __resetCloudComputerRunnerForTests([task]);
    const waiting = waitForComputerOwner(task, "Please sign in", 10_000);
    await flushWrites();
    expect(row.status).toBe("needs_input");
    expect(row.usageReceipt).toMatchObject({
      phase: "admitted",
      observedQuantity: 15,
      periodKey: PERIOD,
    });
    vi.setSystemTime(NOW);
    task.reply?.(null);
    await waiting;
    __resetCloudComputerRunnerForTests();
    vi.setSystemTime(new Date(NOW.getTime() + 30_000));
    await stopComputerTask(USER, ID);
    await reconcileUsageReceipts();
    expect(h.receipts.get(KEY)).toMatchObject({ periodKey: PERIOD, quantity: "15" });
  });

  it("settles cross-process Stop once in the original period, excluding unobserved time", async () => {
    const row = fixture();
    expect((await stopComputerTask(USER, ID)).status).toBe("stopped");
    expect(row.usageReceipt).toMatchObject({ phase: "settled", periodKey: PERIOD, quantity: 14.5 });
    await reconcileUsageReceipts();
    await stopComputerTask(USER, ID);
    await reconcileUsageReceipts();
    expect(h.receipts.size).toBe(1);
    expect(h.receipts.get(KEY)).toMatchObject({
      periodKey: PERIOD,
      quantity: "14.5",
      occurredAt: row.startedAt,
    });
  });

  it("preserves newer observed usage when an earlier task update is delayed", async () => {
    const row = fixture();
    const task = liveFixture(row);
    task.session = { isClosed: false, cancelCurrentInput: vi.fn() } as unknown as NonNullable<
      LiveTask["session"]
    >;
    __resetCloudComputerRunnerForTests([task]);
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<void>();
    h.beforeWrite = async () => {
      entered.resolve();
      await held.promise;
    };
    const control = takeComputerControl(USER, ID).catch(() => null);
    await entered.promise;
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const waiting = waitForComputerOwner(task, "Please sign in", 10_000);
    await flushWrites();
    held.resolve();
    await control;
    await flushWrites();
    expect(row.status).toBe("needs_input");
    expect(row.usageReceipt).toMatchObject({ phase: "admitted", observedQuantity: 16 });
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 60_000);
    task.reply?.(null);
    await waiting;
  });

  it("recovers a hard crash in the background without billing the subsequent downtime", async () => {
    const row = fixture({ stale: true });
    await reconcileUsageReceipts();
    expect(row).toMatchObject({
      status: "interrupted",
      usageReceipt: { phase: "settled", quantity: 5, periodKey: PERIOD },
    });
    expect(h.receipts.get(KEY)).toMatchObject({ quantity: "5", periodKey: PERIOD });
  });

  it("retains a terminal receipt after a ledger failure and recovers it on the next sweep", async () => {
    const row = fixture({ stale: true });
    h.failReceipts = 1;
    await expect(reconcileUsageReceipts()).rejects.toThrow("Receipt storage unavailable");
    expect(row).toMatchObject({
      status: "interrupted",
      usageReceipt: { phase: "settled", quantity: 5 },
    });
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await reconcileUsageReceipts();
    expect(h.receipts.get(KEY)).toMatchObject({ quantity: "5", periodKey: PERIOD });
  });

  it("leaves admission recoverable when the terminal write fails", async () => {
    const row = fixture({ stale: true });
    h.failWrites = 1;
    await expect(reconcileUsageReceipts()).rejects.toThrow("Task storage unavailable");
    expect(row).toMatchObject({
      status: "running",
      usageReceipt: { phase: "admitted", observedQuantity: 5 },
    });
    expect(h.receipts.size).toBe(0);
    await reconcileUsageReceipts();
    expect(h.receipts.size).toBe(1);
  });

  it("does not interrupt or bill a task whose heartbeat wins the stale cleanup race", async () => {
    const row = fixture({ stale: true });
    h.beforeWrite = () => {
      row.updatedAt = NOW;
    };
    expect((await getComputerTask(USER, ID)).status).toBe("running");
    await reconcileUsageReceipts();
    expect(h.receipts.size).toBe(0);
    expect(row.usageReceipt?.phase).toBe("admitted");
  });

  it("preserves a completed winner when Stop races its terminal write", async () => {
    const row = fixture();
    h.beforeWrite = () =>
      Object.assign(row, {
        status: "completed",
        summary: "Finished first",
        finishedAt: NOW,
        usageReceipt: { ...row.usageReceipt, phase: "settled", quantity: 15 },
      });
    const result = await stopComputerTask(USER, ID);
    expect(result).toMatchObject({ status: "completed", summary: "Finished first" });
    await reconcileUsageReceipts();
    expect(h.receipts.get(KEY)?.quantity).toBe("15");
  });

  it("retries a cross-process Stop against the latest checkpoint when a heartbeat wins", async () => {
    const row = fixture();
    h.beforeWrite = () =>
      Object.assign(row, {
        updatedAt: NOW,
        usageReceipt: computerUsageCheckpoint(
          PERIOD,
          row.startedAt.getTime(),
          NOW.getTime(),
          60 * 60_000,
          "admitted",
        ),
      });
    expect((await stopComputerTask(USER, ID)).status).toBe("stopped");
    await reconcileUsageReceipts();
    expect(h.receipts.get(KEY)).toMatchObject({ quantity: "15", periodKey: PERIOD });
  });

  it("cannot be prematurely metered by an older worker during a rolling deployment", async () => {
    const row = fixture();
    // The previous reporter forwards every non-null receipt without checking phase.
    await expect(
      recordSettledUsageReceipt({
        userId: USER,
        meter: "computer_minutes",
        sourceType: "computer_task",
        sourceId: ID,
        receipt: row.usageReceipt as unknown as DurableUsageReceipt,
      }),
    ).rejects.toThrow("Usage quantity must be a non-negative number.");
    expect(h.receipts.size).toBe(0);
    await stopComputerTask(USER, ID);
    await reconcileUsageReceipts();
    expect(h.receipts.get(KEY)?.quantity).toBe("14.5");
  });

  it("recovers an admission left terminal by an older Stop without replacing its outcome", async () => {
    const row = fixture();
    Object.assign(row, {
      status: "stopped",
      finishedAt: NOW,
      updatedAt: NOW,
      summary: "Stopped by the owner.",
    });
    await reconcileUsageReceipts();
    expect(row).toMatchObject({
      status: "stopped",
      finishedAt: NOW,
      summary: "Stopped by the owner.",
      usageReceipt: { phase: "settled", quantity: 14.5 },
    });
    expect(h.receipts.get(KEY)).toMatchObject({ quantity: "14.5", periodKey: PERIOD });
  });

  it("does not replace a remote Stop receipt when the original executor later shuts down", async () => {
    const row = fixture();
    const task = liveFixture(row);
    await stopComputerTask(USER, ID);
    __resetCloudComputerRunnerForTests([task]);
    await interruptCloudComputerTasks();
    await reconcileUsageReceipts();
    expect(row).toMatchObject({
      status: "stopped",
      usageReceipt: { quantity: 14.5, phase: "settled" },
    });
    expect(h.receipts.get(KEY)?.quantity).toBe("14.5");
  });

  it("does not invent billing identity for interrupted legacy tasks", async () => {
    const row = fixture({ stale: true, legacy: true });
    expect((await getComputerTask(USER, ID)).status).toBe("interrupted");
    await reconcileUsageReceipts();
    expect(row.usageReceipt).toBeNull();
    expect(h.receipts.size).toBe(0);
  });
});
