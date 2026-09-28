import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

export type WorkspaceCommitter = (directory: string, temporaryBasename: string) => Promise<void>;
const failure = () =>
  new Error(
    "The local save could not be confirmed. Restart BotBound Desktop before continuing and check the last action in its destination.",
  );

/** Main-process-only persistence primitive. No renderer/model operation can invoke this API. */
export function createWorkspaceCommitter(helperPath: string): WorkspaceCommitter {
  if (!isAbsolute(helperPath)) throw new Error("An absolute persistence helper path is required.");
  return async (directory, temporaryBasename) => {
    if (
      !isAbsolute(directory) ||
      directory.length > 4096 ||
      directory.includes("\r") ||
      directory.includes("\n") ||
      directory.includes("\0") ||
      temporaryBasename.length !== 50 ||
      !/^workspace-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.tmp$/.test(
        temporaryBasename,
      )
    )
      throw failure();
    await new Promise<void>((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(helperPath, [], {
          shell: false,
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        reject(failure());
        return;
      }
      let output = "";
      let settled = false;
      let stopping = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (ok) resolve();
        else reject(failure());
      };
      const stop = () => {
        if (settled || stopping) return;
        stopping = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* The outcome remains uncertain; never replay. */
        }
        // A kill request is not proof of exit. Keep the store queue fenced until
        // close confirms this process can no longer replace a later workspace.
        // This promise stays pending if the OS refuses termination; the event
        // loop remains responsive, but no subsequent save/action can proceed.
      };
      const deadline = setTimeout(stop, 15_000);
      child.stdout!.on("data", (chunk: Buffer) => {
        if (settled || stopping) return;
        output += chunk.toString("utf8");
        if (Buffer.byteLength(output, "utf8") > 1024) stop();
      });
      child.stderr!.resume(); // Never expose paths, encrypted data or raw native diagnostics.
      child.stdin!.on("error", stop);
      child.on("error", stop);
      child.on("close", (code) => {
        if (stopping || code !== 0) return finish(false);
        try {
          const reply = JSON.parse(output);
          finish(reply && Object.keys(reply).length === 1 && reply.status === "committed");
        } catch {
          finish(false);
        }
      });
      try {
        child.stdin!.end(
          JSON.stringify({
            version: 1,
            operation: "commit_workspace",
            directory,
            temporaryBasename,
          }),
        );
      } catch {
        stop();
      }
    });
  };
}
