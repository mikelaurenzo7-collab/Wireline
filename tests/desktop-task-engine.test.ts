import { describe, expect, it, vi } from "vitest";
import { TaskEngine } from "../apps/desktop/src/task-engine";
import type { NativeAdapter, NativeObservation } from "../apps/desktop/src/native";
import type { DesktopStore, SavedState } from "../apps/desktop/src/store";
import { catalogDigest, type McpClient } from "../apps/desktop/src/mcp-client";

const image = { mimeType: "image/png" as const, data: "aGVsbG8=", width: 200, height: 100 };
const observed = {
  window: {
    id: "w1",
    title: "Document",
    appName: "Editor",
    processId: 10,
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    scaleFactor: 1,
  },
  screenshot: image,
  fingerprint: "frame1",
} as NativeObservation;
const proposed = {
  decision: "action",
  summary: "Enter the requested title.",
  action: { type: "type_text", text: "Prospects" },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let state: SavedState = { version: 1, credential: null, servers: [], task: null };
  const persist = vi.fn(async (change: (value: SavedState) => SavedState) => {
    state = structuredClone(change(state));
  });
  const store = { read: () => structuredClone(state), update: persist } as unknown as DesktopStore;
  const native = {
    listWindows: vi.fn(async () => [observed.window]),
    observe: vi.fn(async () => observed),
    execute: vi.fn(async () => ({
      status: "applied" as const,
      message: "Input accepted; not a saved-document receipt.",
    })),
  };
  const call = vi
    .fn()
    .mockResolvedValueOnce({ structuredContent: proposed, text: "", isError: false })
    .mockResolvedValue({
      structuredContent: {
        decision: "complete",
        summary: "Review the document title.",
        action: null,
      },
      text: "",
      isError: false,
    });
  const restore = () =>
    new TaskEngine({
      store,
      native: native as NativeAdapter,
      planner: { call } as unknown as McpClient,
      server: () => {
        throw new Error("No server configured");
      },
      notify: vi.fn(),
      platform: "windows",
    });
  const engine = restore();
  const start = (target = engine) =>
    target.start(
      {
        botId: "bot1",
        goal: "Prepare a prospect research document.",
        windowId: "w1",
        serverIds: [],
        shareConfirmed: true,
      },
      [{ id: "bot1", name: "My Bot" }],
    );
  return { engine, start, native, call, persist, store, restore, state: () => state };
}
describe("desktop task local authority", () => {
  it.each([false, true])(
    "drains an in-flight native action before shutdown even if Stop persistence fails=%s",
    async (failStopSave) => {
      const test = setup(),
        executed = deferred<{ status: "applied"; message: string }>();
      test.native.execute.mockReturnValue(executed.promise);
      await test.start();
      const approved = test.engine.approve(test.engine.view()!.proposal!.id);
      await vi.waitFor(() => expect(test.native.execute).toHaveBeenCalledOnce());
      if (failStopSave) test.persist.mockRejectedValueOnce(new Error("Disk full"));
      let finished = false;
      const drained = test.engine.stopAndDrain();
      const observedDrain = drained.then(
        () => {
          finished = true;
          return null;
        },
        (error: Error) => {
          finished = true;
          return error;
        },
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(finished).toBe(false);
      expect(test.engine.active()).toBe(true);
      await expect(test.start()).rejects.toThrow("current task");
      executed.resolve({ status: "applied", message: "The helper exited and cleanup settled." });
      await approved;
      const failure = await observedDrain;
      expect(finished).toBe(true);
      expect(failure?.message ?? null).toBe(failStopSave ? "Disk full" : null);
      expect(test.engine.active()).toBe(false);
      expect(test.call).toHaveBeenCalledTimes(1);
      expect(test.state().task?.receipts[0].status).toBe("applied");
    },
  );
  it("preserves completed history when Stop, close, or suspend revokes access", async () => {
    const test = setup();
    await test.start();
    await test.engine.approve(test.engine.view()!.proposal!.id);
    await test.engine.complete();
    const completed = test.state().task;
    await test.engine.stop("Computer suspended.");
    expect(test.state().task).toEqual(completed);
    expect(test.engine.view()).toMatchObject({
      status: "completed",
      message: "Result reviewed by you.",
      canResume: false,
    });
  });
  it("preserves a failed result but revokes Resume when stopped", async () => {
    const test = setup();
    test.call.mockReset().mockRejectedValue(new Error("Planner unavailable"));
    await test.start();
    expect(test.engine.view()).toMatchObject({ status: "failed", canResume: true });
    const failed = test.state().task;
    await test.engine.stop("Window closed.");
    expect(test.state().task).toEqual(failed);
    expect(test.engine.view()).toMatchObject({
      status: "failed",
      message: "Planner unavailable",
      canResume: false,
    });
    await expect(test.engine.reply("Try again")).rejects.toThrow("cannot resume");
    expect(test.call).toHaveBeenCalledTimes(1);
  });
  it("does not restore a live grant from failed task history", async () => {
    const test = setup();
    test.call.mockReset().mockRejectedValue(new Error("Planner unavailable"));
    await test.start();
    await test.store.update((state) => ({ ...state, task: { ...state.task!, canResume: true } }));
    const restored = test.restore();
    const original = restored.view();
    expect(original?.canResume).toBe(false);
    await expect(restored.reply("Try again")).rejects.toThrow("cannot resume");
    expect(restored.view()).toEqual(original);
    expect(test.call).toHaveBeenCalledTimes(1);
    await test.engine.stop();
  });
  it("allows a fresh failed plan to resume only within its live grant", async () => {
    const test = setup();
    test.call
      .mockReset()
      .mockRejectedValueOnce(new Error("Planner unavailable"))
      .mockResolvedValue({ structuredContent: proposed, text: "", isError: false });
    await test.start();
    expect(test.engine.view()?.canResume).toBe(true);
    await test.engine.reply("Use the same document.");
    expect(test.engine.view()?.status).toBe("approval");
    expect(test.call).toHaveBeenCalledTimes(2);
    await test.engine.stop();
  });
  it("fences Stop and a second Start while window discovery is pending", async () => {
    const test = setup(),
      windows = deferred<NativeObservation["window"][]>();
    test.native.listWindows.mockReturnValue(windows.promise);
    const started = test.start();
    await expect(test.start()).rejects.toThrow("current task");
    await test.engine.stop();
    windows.resolve([observed.window]);
    await expect(started).rejects.toThrow("stopped before sharing");
    expect(test.call).not.toHaveBeenCalled();
    expect(test.native.observe).not.toHaveBeenCalled();
    expect(test.engine.view()).toBeNull();
  });
  it("does not execute a model proposal until its immutable ID is approved", async () => {
    const test = setup();
    await test.start();
    expect(test.engine.view()?.status).toBe("approval");
    expect(test.call.mock.calls[0][1].observation.source.platform).toBe("windows");
    expect(test.native.execute).not.toHaveBeenCalled();
    await expect(test.engine.approve("invented")).rejects.toThrow("no longer");
    await test.engine.approve(test.engine.view()!.proposal!.id);
    expect(test.native.execute).toHaveBeenCalledTimes(1);
    expect(test.engine.view()?.status).toBe("review_result");
    expect(test.engine.view()?.receipts[0].status).toBe("applied");
    // Completion must release the internal observation as well as the UI image.
    const sharedContext = test.engine as unknown as {
      input: unknown;
      observation: NativeObservation | null;
    };
    expect(sharedContext.input).not.toBeNull();
    expect(sharedContext.observation?.screenshot).toEqual(image);
    await test.engine.complete();
    expect(test.engine.view()?.status).toBe("completed");
    expect(test.engine.view()?.preview).toBeUndefined();
    expect(sharedContext.input).toBeNull();
    expect(sharedContext.observation).toBeNull();
    expect(test.engine.view()?.receipts[0].status).toBe("applied");
  });
  it("commits an execution claim before input and rejects a duplicate approval", async () => {
    const test = setup(),
      input = deferred<{ status: "applied"; message: string }>();
    test.native.execute.mockImplementation(async () => {
      expect(test.state().task?.receipts[0].status).toBe("claimed");
      return input.promise;
    });
    await test.start();
    const id = test.engine.view()!.proposal!.id;
    const first = test.engine.approve(id);
    await vi.waitFor(() => expect(test.native.execute).toHaveBeenCalledTimes(1));
    await expect(test.engine.approve(id)).rejects.toThrow("no longer");
    input.resolve({ status: "applied", message: "Input accepted." });
    await first;
    expect(test.native.execute).toHaveBeenCalledTimes(1);
    await test.engine.stop();
  });
  it("keeps normal result review retryable when recording completion fails", async () => {
    const test = setup();
    await test.start();
    await test.engine.approve(test.engine.view()!.proposal!.id);
    const confirmed = test.engine.view();
    expect(confirmed?.status).toBe("review_result");
    test.persist.mockRejectedValueOnce(new Error("Disk full"));
    await expect(test.engine.complete()).rejects.toThrow("Disk full");
    expect(test.engine.view()).toEqual(confirmed);
    expect(test.state().task?.status).toBe("review_result");
    await test.engine.complete();
    expect(test.engine.view()?.status).toBe("completed");
    expect(test.state().task?.status).toBe("completed");
    expect(test.engine.view()?.receipts).toEqual(confirmed?.receipts);
    expect(test.native.execute).toHaveBeenCalledTimes(1);
  });
  it("never dispatches if the durable claim cannot be written", async () => {
    const test = setup();
    await test.start();
    test.persist.mockRejectedValueOnce(new Error("Disk full"));
    await test.engine.approve(test.engine.view()!.proposal!.id);
    expect(test.native.execute).not.toHaveBeenCalled();
    expect(test.engine.view()?.status).toBe("needs_input");
    await test.engine.stop();
  });
  it("ignores a late plan after Stop and clears the shared screenshot", async () => {
    const test = setup(),
      plan = deferred<unknown>();
    test.call.mockReset().mockReturnValue(plan.promise);
    const started = test.start();
    await vi.waitFor(() => expect(test.call).toHaveBeenCalledOnce());
    await test.engine.stop();
    plan.resolve({ structuredContent: proposed, isError: false, text: "" });
    await started;
    expect(test.engine.view()?.status).toBe("stopped");
    expect(test.engine.view()?.proposal).toBeNull();
    expect(test.engine.view()?.preview).toBeUndefined();
    expect(test.native.execute).not.toHaveBeenCalled();
  });
  it("records uncertain native outcomes and refuses automatic retry", async () => {
    const test = setup();
    test.native.execute.mockRejectedValue(new Error("Pipe closed after dispatch"));
    await test.start();
    const id = test.engine.view()!.proposal!.id;
    await test.engine.approve(id);
    expect(test.engine.view()?.status).toBe("unknown");
    expect(test.call).toHaveBeenCalledTimes(1);
    await expect(test.engine.approve(id)).rejects.toThrow("no longer");
    await expect(test.engine.reply("retry")).rejects.toThrow("cannot resume");
    await test.engine.stop();
  });
  it("retains unknown receipts through Stop until destination review allows a new task", async () => {
    const test = setup();
    test.native.execute.mockRejectedValue(new Error("Result lost after dispatch"));
    await test.start();
    const id = test.engine.view()!.proposal!.id;
    await test.engine.approve(id);
    const receipt = test.engine.view()!.receipts[0];
    const priorTaskId = test.engine.view()!.id;
    await expect(test.start()).rejects.toThrow("acknowledge the unconfirmed outcome");
    await test.engine.stop();
    expect(test.engine.view()?.status).toBe("unknown");
    await expect(test.start()).rejects.toThrow("acknowledge the unconfirmed outcome");
    expect(test.state().task?.receipts).toEqual([receipt]);
    await test.engine.complete();
    expect(test.state().task).toMatchObject({
      status: "stopped",
      unknownOutcomeReviewed: true,
      receipts: [receipt],
    });
    expect(receipt.status).toBe("unknown");
    await expect(test.engine.reply("Retry it")).rejects.toThrow("cannot resume");
    await expect(test.engine.approve(id)).rejects.toThrow("no longer");
    expect(test.native.execute).toHaveBeenCalledTimes(1);
    await test.start();
    expect(test.engine.view()?.id).not.toBe(priorTaskId);
    expect(test.native.execute).toHaveBeenCalledTimes(1);
    await test.engine.stop();
  });
  it("keeps unknown review retryable when recording the acknowledgment fails", async () => {
    const test = setup();
    test.native.execute.mockRejectedValue(new Error("Result lost"));
    await test.start();
    await test.engine.approve(test.engine.view()!.proposal!.id);
    const unresolved = test.engine.view();
    test.persist.mockRejectedValueOnce(new Error("Disk full"));
    await expect(test.engine.complete()).rejects.toThrow("Disk full");
    expect(test.engine.view()).toEqual(unresolved);
    expect(test.state().task?.unknownOutcomeReviewed).toBeUndefined();
    await expect(test.start()).rejects.toThrow("acknowledge the unconfirmed outcome");
    await test.engine.complete();
    expect(test.state().task?.unknownOutcomeReviewed).toBe(true);
    expect(test.state().task?.receipts[0].status).toBe("unknown");
    expect(test.native.execute).toHaveBeenCalledTimes(1);
  });
  it.each(["restart", "account restoration"])(
    "requires review after %s, including older stopped receipts",
    async (mode) => {
      const test = setup();
      test.native.execute.mockRejectedValue(new Error("Result lost"));
      await test.start();
      await test.engine.approve(test.engine.view()!.proposal!.id);
      await test.engine.stop();
      // Older saved tasks could already have been marked stopped without reviewing the receipt.
      await test.store.update((state) => ({
        ...state,
        task: { ...state.task!, status: "stopped" },
      }));
      const restored = mode === "restart" ? test.restore() : test.engine;
      if (mode === "account restoration") restored.resetAccount();
      await expect(test.start(restored)).rejects.toThrow("acknowledge the unconfirmed outcome");
      await restored.complete();
      const reviewed = test.restore();
      expect(reviewed.view()).toMatchObject({
        unknownOutcomeReviewed: true,
        receipts: [{ status: "unknown" }],
      });
      await test.start(reviewed);
      expect(test.native.execute).toHaveBeenCalledTimes(1);
      await reviewed.stop();
    },
  );
  it("keeps new tasks blocked while the unknown acknowledgment is being saved", async () => {
    const test = setup(),
      saved = deferred<void>();
    test.native.execute.mockRejectedValue(new Error("Result lost"));
    await test.start();
    await test.engine.approve(test.engine.view()!.proposal!.id);
    const persist = test.persist.getMockImplementation()!;
    test.persist.mockImplementationOnce(async (change) => {
      await saved.promise;
      await persist(change);
    });
    const acknowledgment = test.engine.complete();
    await expect(test.start()).rejects.toThrow("current task");
    expect(test.engine.view()?.status).toBe("unknown");
    saved.resolve();
    await acknowledgment;
    expect(test.engine.view()?.unknownOutcomeReviewed).toBe(true);
    expect(test.native.execute).toHaveBeenCalledTimes(1);
  });
  it("rejects Resume for a restored failed task with an unreviewed unknown receipt", async () => {
    const test = setup();
    test.native.execute.mockRejectedValue(new Error("Result lost"));
    await test.start();
    await test.engine.approve(test.engine.view()!.proposal!.id);
    await test.engine.stop();
    await test.store.update((state) => ({ ...state, task: { ...state.task!, status: "failed" } }));
    const restored = test.restore();
    await expect(restored.reply("Try the same action again")).rejects.toThrow("cannot resume");
    expect(test.call).toHaveBeenCalledTimes(1);
    expect(test.native.execute).toHaveBeenCalledTimes(1);
    await restored.complete();
    expect(restored.view()?.unknownOutcomeReviewed).toBe(true);
  });
  it.each(["account", "task"])(
    "does not write an acknowledgment over a queued %s switch",
    async (scope) => {
      const test = setup(),
        queued = deferred<void>();
      test.native.execute.mockRejectedValue(new Error("Result lost"));
      await test.start();
      await test.engine.approve(test.engine.view()!.proposal!.id);
      await test.engine.stop();
      await test.store.update((state) => ({ ...state, accountId: "account-A" }));
      const persist = test.persist.getMockImplementation()!;
      test.persist.mockImplementationOnce(async (change) => {
        await queued.promise;
        await persist(change);
      });
      const acknowledgement = test.engine.complete();
      const rejected = expect(acknowledgement).rejects.toThrow("account or task changed");
      // OAuth restoration is already ahead of acknowledgment in the serialized journal queue.
      await persist((state) => ({
        ...state,
        accountId: scope === "account" ? "account-B" : state.accountId,
        task: {
          ...state.task!,
          id: scope === "task" ? "other-task" : state.task!.id,
          message: "Restored account workspace",
          receipts: [],
        },
      }));
      const restored = structuredClone(test.state());
      queued.resolve();
      await rejected;
      expect(test.state()).toEqual(restored);
      expect(test.state().task?.receipts).toEqual([]);
      expect(test.state().task?.unknownOutcomeReviewed).toBeUndefined();
      expect(test.engine.view()?.unknownOutcomeReviewed).toBeUndefined();
      expect(test.native.execute).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps account switching blocked while an interrupted dispatch unwinds", async () => {
    const test = setup(),
      result = deferred<{ status: "applied"; message: string }>();
    test.native.execute.mockReturnValue(result.promise);
    await test.start();
    const approved = test.engine.approve(test.engine.view()!.proposal!.id);
    await vi.waitFor(() => expect(test.native.execute).toHaveBeenCalledOnce());
    await test.engine.stop();
    expect(test.engine.active()).toBe(true);
    expect(() => test.engine.resetAccount()).toThrow("Stop");
    result.resolve({ status: "applied", message: "Input was accepted before Stop." });
    await approved;
    expect(test.engine.active()).toBe(false);
    expect(test.engine.view()?.status).toBe("stopped");
    expect(test.call).toHaveBeenCalledTimes(1);
  });
  it("cannot execute a stale-frame rejection by reusing approval", async () => {
    const test = setup();
    test.native.execute.mockResolvedValue({
      status: "rejected",
      message: "The window changed.",
    } as never);
    await test.start();
    const id = test.engine.view()!.proposal!.id;
    await test.engine.approve(id);
    expect(test.engine.view()?.status).toBe("needs_input");
    await expect(test.engine.approve(id)).rejects.toThrow("no longer");
    await test.engine.stop();
  });
});

describe("desktop selected MCP execution", () => {
  const tool = {
    name: "research",
    description: "Search public business information",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  };
  function setupRemote() {
    const digest = catalogDigest([tool]);
    let state: SavedState = {
      version: 1,
      credential: null,
      task: null,
      servers: [
        {
          id: "research-server",
          label: "Research",
          url: "https://example.com/mcp",
          token: "private",
          tools: [tool],
          catalogDigest: digest,
          approvedDigest: digest,
          selectedTools: [tool.name],
        },
      ],
    };
    const store = {
      read: () => structuredClone(state),
      update: async (change: (value: SavedState) => SavedState) => {
        state = structuredClone(change(state));
      },
    } as DesktopStore;
    const remote = {
      tools: vi.fn(async () => [tool]),
      call: vi.fn(async () => ({
        text: "A business match with its public source URL.",
        isError: false,
      })),
    };
    const planner = {
      call: vi
        .fn()
        .mockResolvedValueOnce({
          isError: false,
          text: "",
          structuredContent: {
            decision: "action",
            summary: "Research public business matches.",
            action: {
              type: "mcp_call",
              serverId: "research-server",
              name: "research",
              arguments: { query: "local businesses" },
            },
          },
        })
        .mockResolvedValue({
          isError: false,
          text: "",
          structuredContent: {
            decision: "complete",
            summary: "Review the sourced match.",
            action: null,
          },
        }),
    };
    const engine = new TaskEngine({
      store,
      native: {} as NativeAdapter,
      planner: planner as unknown as McpClient,
      server: () => remote as unknown as McpClient,
      notify: vi.fn(),
    });
    const start = () =>
      engine.start(
        {
          botId: "bot1",
          goal: "Find a business match with a source.",
          windowId: null,
          serverIds: ["research-server"],
          shareConfirmed: true,
        },
        [{ id: "bot1", name: "Bot" }],
      );
    return { engine, remote, planner, start };
  }
  it("requires renewed catalog review when the remote schema or description changes", async () => {
    const test = setupRemote();
    await test.start();
    test.remote.tools.mockResolvedValue([{ ...tool, description: "Changed behavior" }]);
    await test.engine.approve(test.engine.view()!.proposal!.id);
    expect(test.remote.call).not.toHaveBeenCalled();
    expect(test.engine.view()?.status).toBe("needs_input");
    expect(test.engine.view()?.message).toContain("tools changed");
    await test.engine.stop();
  });
  it("records a lost remote result as unknown and does not replan or resend", async () => {
    const test = setupRemote();
    await test.start();
    test.remote.call.mockRejectedValue(new Error("Result lost after dispatch"));
    await test.engine.approve(test.engine.view()!.proposal!.id);
    expect(test.engine.view()?.status).toBe("unknown");
    expect(test.remote.call).toHaveBeenCalledTimes(1);
    expect(test.planner.call).toHaveBeenCalledTimes(1);
    await test.engine.stop();
  });
  it("asks the owner to review a successful tool result before marking the task complete", async () => {
    const test = setupRemote();
    await test.start();
    expect(test.remote.call).not.toHaveBeenCalled();
    await test.engine.approve(test.engine.view()!.proposal!.id);
    expect(test.engine.view()?.status).toBe("review_result");
    expect(test.engine.view()?.receipts[0].status).toBe("applied");
    await test.engine.complete();
    expect(test.engine.view()?.status).toBe("completed");
  });
});
