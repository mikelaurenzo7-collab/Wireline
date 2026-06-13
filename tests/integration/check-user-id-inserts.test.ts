import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const guardScript = path.join(repoRoot, "scripts/check-user-id-inserts.mjs");

function runGuard(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "wireline-tenant-insert-"));
  const sourceDir = path.join(root, "src");
  mkdirSync(sourceDir, { recursive: true });

  for (const [fileName, contents] of Object.entries(files)) {
    const filePath = path.join(sourceDir, fileName);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents, "utf8");
  }

  return spawnSync(process.execPath, [guardScript, "--source-dir", sourceDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("check-user-id-inserts", () => {
  it("fails tenant-owned inserts that do not carry an obvious userId", () => {
    const result = runGuard({
      "unsafe.ts": `
        import * as schema from "../db/schema";
        await drizzle.insert(schema.agents).values({ name: "Orphan" });
      `,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("schema.agents without an obvious userId");
  });

  it("passes tenant-owned inserts with explicit user ownership", () => {
    const result = runGuard({
      "safe.ts": `
        import * as schema from "../db/schema";
        await drizzle.insert(schema.agents).values({ userId: req.user.id, name: "Owned" });
      `,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Tenant-owned inserts include an obvious userId");
  });

  it("ignores non-tenant tables and test fixtures", () => {
    const result = runGuard({
      "route.ts": `
        import * as schema from "../db/schema";
        await drizzle.insert(schema.auditEvents).values({ action: "healthcheck" });
      `,
      "ignored.test.ts": `
        import * as schema from "../db/schema";
        await drizzle.insert(schema.agents).values({ name: "Fixture" });
      `,
    });

    expect(result.status).toBe(0);
  });
});
