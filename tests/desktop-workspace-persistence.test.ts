import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceCommitter } from "../apps/desktop/src/workspace-persistence";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const helper = resolve("native", "BotBound.Native.exe");
const directory = resolve("test-workspace");
const temporary = "workspace-12345678-1234-1234-1234-123456789abc.tmp";
function processFixture() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("main-only workspace persistence runner", () => {
  it("uses only a fixed binary and bounded workspace commit request", async () => {
    const child = processFixture();
    let input = "";
    child.stdin.on("data", (part) => {
      input += part.toString();
    });
    const pending = createWorkspaceCommitter(helper)(directory, temporary);
    expect(spawn).toHaveBeenCalledWith(helper, [], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(JSON.parse(input)).toEqual({
      version: 1,
      operation: "commit_workspace",
      directory,
      temporaryBasename: temporary,
    });
    child.stdout.write('{"status":"committed"}');
    child.emit("close", 0);
    await expect(pending).resolves.toBeUndefined();
  });

  it.each([
    ['{"status":"rejected"}', 0],
    ['{"status":"committed","message":"private"}', 0],
    ['{"status":"committed"}', 1],
    ["private native failure", 0],
  ])("fails closed on unsupported or malformed acknowledgments (%s)", async (reply, code) => {
    const child = processFixture();
    const pending = createWorkspaceCommitter(helper)(directory, temporary);
    const rejected = expect(pending).rejects.toThrow("Restart BotBound Desktop");
    child.stderr.write("private path or encrypted workspace diagnostic");
    child.stdout.write(reply);
    child.emit("close", code);
    await rejected;
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it.each([true, false, "throws"] as const)(
    "waits for actual exit after timeout even if termination returns %s",
    async (killResult) => {
      vi.useFakeTimers();
      const child = processFixture();
      child.kill.mockImplementation(() => {
        if (killResult === "throws") throw new Error("Termination refused");
        return killResult;
      });
      const pending = createWorkspaceCommitter(helper)(directory, temporary);
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      const rejected = expect(pending).rejects.toThrow("local save could not be confirmed");
      await vi.advanceTimersByTimeAsync(15_000);
      expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).toBe(false);
      child.stdout.write('{"status":"committed"}');
      expect(settled).toBe(false);
      child.emit("close", 0);
      await rejected;
      expect(spawn).toHaveBeenCalledTimes(1);
    },
  );

  it("refuses path escape before spawning and hides a launch error", async () => {
    const commit = createWorkspaceCommitter(helper);
    for (const filename of ["../workspace.enc", "workspace.enc", `${temporary}\n`])
      await expect(commit(directory, filename)).rejects.toThrow(
        "local save could not be confirmed",
      );
    expect(spawn).not.toHaveBeenCalled();
    vi.mocked(spawn).mockImplementation(() => {
      throw new Error("private path error");
    });
    await expect(commit(directory, temporary)).rejects.toThrow("local save could not be confirmed");
  });
});
