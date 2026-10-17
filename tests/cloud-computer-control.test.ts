import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  holdWrite: null as Promise<void> | null,
  failResumeWrite: false,
  failControlWrite: false,
}));

vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const query = (write = false) => {
    let patch: Record<string, unknown> = {};
    let params: unknown[] = [];
    const chain = {
      from: () => chain,
      where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
        params = dialect.sqlToQuery(condition).params;
        return chain;
      },
      limit: () => chain,
      set: (next: Record<string, unknown>) => {
        patch = next;
        return chain;
      },
      returning: () => chain,
      then: (resolve: (rows: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve()
          .then(async () => {
            if (!params.includes(h.row.id) || !params.includes(h.row.userId)) return [];
            if (!write) return [{ ...h.row }];
            h.writes.push(patch);
            if (h.failResumeWrite && patch.status === "running")
              throw new Error("Database unavailable");
            if (h.holdWrite) await h.holdWrite;
            if (h.failControlWrite && patch.status === undefined)
              throw new Error("Control request persistence unavailable");
            h.row = { ...h.row, ...patch };
            return [{ id: h.row.id }];
          })
          .then(resolve, reject),
    };
    return chain;
  };
  return {
    drizzle: { select: () => query(), update: () => query(true) },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    tenantStore: { run: (_id: string, operation: () => unknown) => operation() },
  };
});

import {
  __resetCloudComputerRunnerForTests,
  replyToComputerTask,
  returnComputerControlToBot,
  sendComputerOwnerInput,
  stopComputerTask,
  takeComputerControl,
  waitForComputerOwner,
} from "../src/lib/cloud-computer/task-runner";

type LiveTask = NonNullable<Parameters<typeof __resetCloudComputerRunnerForTests>[0]>[number];
const id = "c745f1df-7f7d-43c4-974e-36a9af943c34";
const userId = "d20e5116-9ee3-4fa4-96e1-a2e82352a553";

function fixture(status = "running") {
  h.row = {
    id,
    userId,
    agentId: "agent-owned",
    goal: "Review the public page.",
    startUrl: "https://example.com/",
    status,
    summary: null,
    question: null,
    sources: [],
    events: [],
    errorCode: null,
    turnCount: 1,
    actionCount: 0,
    startedAt: new Date(),
    finishedAt: null,
    updatedAt: new Date(),
  };
  const task = {
    taskId: id,
    userId,
    agentId: "agent-owned",
    startedAt: Date.now(),
    stop: false,
    expiredBrowser: false,
    stopAt: null,
    session: {
      isClosed: false,
      cancelCurrentInput: vi.fn(),
      ownerTabs: () => [],
      activeUrl: () => "https://example.com/",
      frame: vi.fn(async () => Buffer.from("safe-screen")),
      executeOwnerInput: vi.fn(async () => Buffer.from("owner-screen")),
    },
    frame: Buffer.from("screen"),
    frameAt: Date.now(),
    frameUrl: "https://example.com/",
    currentUrl: "https://example.com/",
    ownerFrameRefresh: null,
    ownerFrameEpoch: 0,
    agentPointer: null,
    events: [],
    turns: 1,
    actions: 0,
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
  } as unknown as LiveTask;
  __resetCloudComputerRunnerForTests([task]);
  return task;
}

beforeEach(() => {
  h.writes = [];
  h.holdWrite = null;
  h.failResumeWrite = false;
  h.failControlWrite = false;
});
afterEach(() => {
  __resetCloudComputerRunnerForTests();
});

describe("owner-requested computer pause admission", () => {
  it("does not resume execution when saving the running state fails", async () => {
    const task = fixture();
    const waiting = waitForComputerOwner(task, "What next?", 10_000);
    await vi.waitFor(() => expect(h.row.status).toBe("needs_input"));
    h.failResumeWrite = true;
    task.reply?.("Continue with the public page.");
    await expect(waiting).rejects.toMatchObject({ status: 503 });
    expect(h.row.status).toBe("needs_input");
    expect(task.ownerControl).toBe(false);
  });

  it("does not write running after Stop wakes an owner checkpoint", async () => {
    const task = fixture();
    const waiting = waitForComputerOwner(task, "What next?", 10_000);
    await vi.waitFor(() => expect(h.row.status).toBe("needs_input"));
    await stopComputerTask(userId, id);
    expect(await waiting).toBeNull();
    expect(h.writes).toHaveLength(1);
    expect(task).toMatchObject({ stop: true, ownerControl: false, controlRequested: false });
  });
  it("rejects an in-flight duplicate and acknowledges only an already-saved pause", async () => {
    const task = fixture();
    let release!: () => void;
    h.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = takeComputerControl(userId, id);
    await vi.waitFor(() => expect(h.writes).toHaveLength(1));
    await expect(takeComputerControl(userId, id)).rejects.toMatchObject({ status: 409 });
    expect(task.controlRequested).toBe(false);
    release();
    const first = await pending;
    const second = await takeComputerControl(userId, id);
    expect(first).toMatchObject({ status: "running", controlRequested: true, ownerControl: false });
    expect(second).toMatchObject({
      status: "running",
      controlRequested: true,
      ownerControl: false,
    });
    expect(task.events).toHaveLength(1);
    expect(h.writes).toHaveLength(1);
  });

  it("does not acknowledge a concurrent request while the first request can still fail to save", async () => {
    const task = fixture();
    let release!: () => void;
    h.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.failControlWrite = true;
    const first = takeComputerControl(userId, id).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await vi.waitFor(() => expect(h.writes).toHaveLength(1));
      await expect(takeComputerControl(userId, id)).rejects.toMatchObject({ status: 409 });
      expect(task.controlRequested).toBe(false);
    } finally {
      release();
    }
    expect((await first).error).toMatchObject({ status: 503 });
    expect(task.controlRequested).toBe(false);
    expect(h.row.status).toBe("running");
  });

  it("keeps Stop authoritative while the pause request is saving", async () => {
    const task = fixture();
    let release!: () => void;
    h.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = takeComputerControl(userId, id);
    await vi.waitFor(() => expect(h.writes).toHaveLength(1));
    const stopped = await stopComputerTask(userId, id);
    expect(stopped).toMatchObject({ stopping: true, controlRequested: false, ownerControl: false });
    release();
    expect(await pending).toMatchObject({
      stopping: true,
      controlRequested: false,
      ownerControl: false,
    });
    expect(task.stop).toBe(true);
  });

  it("cannot request another tenant's task or pretend a task on another process is locally controlled", async () => {
    fixture();
    await expect(takeComputerControl("another-tenant", id)).rejects.toMatchObject({ status: 404 });
    __resetCloudComputerRunnerForTests();
    await expect(takeComputerControl(userId, id)).rejects.toMatchObject({ status: 409 });
    expect(h.writes).toHaveLength(0);
  });

  it("refuses an expired browser and clears the pending request", async () => {
    const task = fixture();
    Object.assign(task.session!, { isClosed: true });
    await expect(takeComputerControl(userId, id)).rejects.toMatchObject({ status: 410 });
    expect(task).toMatchObject({ stop: true, expiredBrowser: true, controlRequested: false });
    expect(h.writes).toHaveLength(0);
  });

  it("does not expose owner input until the executor has reached the handoff", async () => {
    const task = fixture();
    await takeComputerControl(userId, id);
    await expect(
      sendComputerOwnerInput(userId, id, { kind: "type", text: "private-value" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(task.session!.executeOwnerInput).not.toHaveBeenCalled();
    expect(JSON.stringify(task.events)).not.toContain("private-value");
  });

  it.each([false, true])(
    "fences duplicate requests while publishing a checkpoint (prepared browser: %s)",
    async (prepared) => {
      const task = fixture();
      task.preparingBrowser = prepared;
      task.controlRequested = true;
      let release!: () => void;
      h.holdWrite = new Promise<void>((resolve) => {
        release = resolve;
      });
      const waiting = waitForComputerOwner(task, "Browser paused.", 10_000, { takeControl: true });
      await vi.waitFor(() => expect(h.writes).toHaveLength(1));
      expect(task).toMatchObject({
        handoffBusy: true,
        controlRequested: false,
        ownerControl: true,
      });
      await expect(takeComputerControl(userId, id)).rejects.toMatchObject({ status: 409 });
      await expect(
        sendComputerOwnerInput(userId, id, { kind: "type", text: "private-value" }),
      ).rejects.toMatchObject({ status: 409 });
      release();
      await vi.waitFor(() => expect(task.handoffBusy).toBe(false));
      const returned = await returnComputerControlToBot(
        userId,
        id,
        prepared ? { goal: "Review the public page." } : undefined,
      );
      expect(returned).toMatchObject({
        status: "running",
        controlRequested: false,
        ownerControl: false,
      });
      expect(await waiting).toContain("current redacted screen");
      expect(task.controlRequested).toBe(false);
      expect(task.controlRequestSaving).toBe(false);
      if (prepared) expect(task.handoffGoal).toBe("Review the public page.");
      expect(JSON.stringify(task.events)).not.toContain("private-value");
    },
  );

  it("serializes return control against stale take, reply and browser-input requests", async () => {
    const task = fixture("needs_input");
    task.ownerControl = true;
    task.reply = vi.fn();
    let release!: () => void;
    h.holdWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = returnComputerControlToBot(userId, id);
    await vi.waitFor(() => expect(h.writes).toHaveLength(1));
    await expect(takeComputerControl(userId, id)).rejects.toMatchObject({ status: 409 });
    await expect(replyToComputerTask(userId, id, { message: "stale reply" })).rejects.toMatchObject(
      { status: 409 },
    );
    await expect(
      sendComputerOwnerInput(userId, id, { kind: "type", text: "private-value" }),
    ).rejects.toMatchObject({ status: 409 });
    release();
    expect(await pending).toMatchObject({ status: "running", ownerControl: false });
    expect(task.reply).toHaveBeenCalledOnce();
    expect(task.reply).toHaveBeenCalledWith(
      expect.stringContaining("Inspect the current redacted screen"),
    );
    expect(task.handoffBusy).toBe(false);
  });
});
