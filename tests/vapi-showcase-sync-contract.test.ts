import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Vapi showcase sync contract", () => {
  it("keeps a single canonical showcase sync path without legacy claude-brain imports", () => {
    const script = read("scripts/sync-wireline-showcase.mts");

    expect(script).toContain("../src/lib/ai-models.ts");
    expect(script).not.toContain("../src/lib/claude-brain.ts");
    expect(existsSync(resolve(process.cwd(), "src/routes/admin-vapi-sync-routes.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/lib/vapi-assistant-factory.ts"))).toBe(false);
  });

  it("does not hide Vapi/showcase debt behind explicit tsconfig excludes", () => {
    const tsconfig = JSON.parse(read("tsconfig.json")) as { exclude?: string[] };
    const excludes = tsconfig.exclude || [];

    expect(excludes).not.toContain("src/routes/admin-vapi-sync-routes.ts");
    expect(excludes).not.toContain("src/lib/vapi-assistant-factory.ts");
    expect(excludes).not.toContain("scripts/sync-wireline-showcase.mts");
  });
});
