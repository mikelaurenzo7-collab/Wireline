import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeHelperRunner, type NativeHelperRequest } from "../apps/desktop/src/native";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

function child(pid = 42) {
  const result = Object.assign(new EventEmitter(), {
    pid,
    exitCode: null as number | null,
    signalCode: null as string | null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      result.signalCode = "SIGTERM";
      queueMicrotask(() => result.emit("close", null));
      return true;
    }),
  });
  return result;
}
const request: NativeHelperRequest = {
  version: 1,
  operation: "execute",
  windowId: "1:2:3",
  action: { type: "keypress", keys: ["CTRL", "A"] },
};

describe("native helper interruption cleanup", () => {
  it.each(["returns false", "throws"])(
    "keeps execution fenced until actual exit when kill %s",
    async (failure) => {
      vi.useFakeTimers();
      const active = child(),
        cleanup = child(43);
      active.kill.mockImplementation(() => {
        if (failure === "throws") throw new Error("Kill failed");
        return false;
      });
      vi.mocked(spawn)
        .mockReturnValueOnce(active as never)
        .mockReturnValueOnce(cleanup as never);
      const controller = new AbortController();
      const result = createNativeHelperRunner("/fixed/BotBound.Native")(request, controller.signal);
      let finished = false;
      void result.then(
        () => {
          finished = true;
        },
        () => {
          finished = true;
        },
      );
      const rejected = expect(result).rejects.toThrow("cancelled");
      controller.abort();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(active.kill).toHaveBeenCalledWith("SIGKILL");
      expect(finished).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(1);
      active.emit("close", 1);
      await vi.advanceTimersByTimeAsync(0);
      expect(spawn).toHaveBeenCalledTimes(2);
      cleanup.stdout.write('{"status":"applied"}');
      cleanup.emit("close", 0);
      await rejected;
      expect(finished).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    },
  );
  it("waits for bounded release-only cleanup after cancel without replaying the original action", async () => {
    const active = child();
    const cleanup = child(43);
    vi.mocked(spawn)
      .mockReturnValueOnce(active as never)
      .mockReturnValueOnce(cleanup as never);
    let cleanupInput = "";
    cleanup.stdin.on("data", (data) => {
      cleanupInput += data.toString();
    });
    const controller = new AbortController();
    const result = createNativeHelperRunner("C:/fixed/BotBound.Native.exe")(
      request,
      controller.signal,
    );
    const rejected = expect(result).rejects.toThrow("cancelled");
    controller.abort();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    expect(active.kill).toHaveBeenCalledOnce();
    expect(JSON.parse(cleanupInput)).toEqual({
      version: 1,
      operation: "release",
      action: request.action,
    });
    expect(
      vi
        .mocked(spawn)
        .mock.calls.every(
          ([path, argv, options]) =>
            path === "C:/fixed/BotBound.Native.exe" &&
            (argv as unknown[]).length === 0 &&
            options?.shell === false,
        ),
    ).toBe(true);
    cleanup.stdout.write('{"status":"applied"}');
    cleanup.exitCode = 0;
    cleanup.emit("close", 0);
    await rejected;
  });
  it("does not run release for an observation or before a cancelled operation starts", async () => {
    const observation = child();
    vi.mocked(spawn).mockReturnValue(observation as never);
    const controller = new AbortController();
    const run = createNativeHelperRunner("/fixed/BotBound.Native");
    const result = run({ version: 1, operation: "inspect", windowId: "1:2:3" }, controller.signal);
    const rejected = expect(result).rejects.toThrow("cancelled");
    controller.abort();
    await rejected;
    expect(spawn).toHaveBeenCalledOnce();
    await expect(run(request, controller.signal)).rejects.toThrow("cancelled");
    expect(spawn).toHaveBeenCalledOnce();
  });
  it("keeps cleanup failure bounded and does not retry either the release or write", async () => {
    const active = child();
    const cleanup = child(43);
    vi.mocked(spawn)
      .mockReturnValueOnce(active as never)
      .mockReturnValueOnce(cleanup as never);
    const result = createNativeHelperRunner("/fixed/BotBound.Native")(request);
    const rejected = expect(result).rejects.toThrow("Native helper failed");
    active.exitCode = 1;
    active.emit("close", 1);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
    cleanup.emit("error", new Error("sensitive operating-system details"));
    await rejected;
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});
