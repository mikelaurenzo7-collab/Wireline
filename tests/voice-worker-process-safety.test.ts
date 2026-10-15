import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

/** Run a snippet with the production fatal-process guard installed. */
function runWithGuard(snippet: string) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `await import(${JSON.stringify(resolve(root, "src/lib/fatal-process-guard.ts"))});\n${snippet}`,
    ],
    { cwd: root, encoding: "utf8", timeout: 20_000 },
  );
}

describe("voice worker process safety nets", () => {
  it("dies silently on a stray rejection when nothing listens for it", () => {
    const result = runWithGuard(`
      Promise.reject(new Error("stray rejection"));
      setTimeout(() => { console.log("still answering calls"); process.exit(0); }, 1500);
    `);
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("still answering calls");
    // The guard's listener suppresses Node's own stack trace, so nothing is logged.
    expect(result.stderr).not.toContain("stray rejection");
  });

  it("keeps running and logs the rejection once a listener is registered", () => {
    const result = runWithGuard(`
      process.on("unhandledRejection", (reason) => console.log("logged:", reason.message));
      Promise.reject(new Error("stray rejection"));
      setTimeout(() => { console.log("still answering calls"); process.exit(0); }, 1500);
    `);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("logged: stray rejection");
    expect(result.stdout).toContain("still answering calls");
  });

  it("registers the API's handlers on both entrypoints", () => {
    for (const file of ["server.ts", "src/entrypoints/voice-worker.ts"]) {
      const source = read(file);
      expect(source, file).toMatch(
        /process\.on\("unhandledRejection", \(reason\) => \{\n\s+log\.error\("unhandledRejection"/,
      );
      expect(source, file).toMatch(
        /process\.on\("uncaughtException", \(error\) => \{\n\s+log\.error\("uncaughtException"/,
      );
      expect(source, file).toContain('kind: "unhandledRejection"');
      expect(source, file).toContain('kind: "uncaughtException"');
    }
  });
});
