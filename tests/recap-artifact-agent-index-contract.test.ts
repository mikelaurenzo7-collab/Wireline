import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("recap artifact agent index", () => {
  it("ships the narrow advisor-recommended covering index and health check", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0107_recap_artifacts_agent_index.sql"),
      "utf8",
    );
    const health = readFileSync(resolve(process.cwd(), "src/lib/db-health-check.ts"), "utf8");

    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_wireline_recap_artifacts_agent_id");
    expect(migration).toContain("wireline_recap_artifacts (agent_id)");
    expect(migration).not.toMatch(/DROP\s+INDEX/i);
    expect(health).toContain('{ table: "wireline_recap_artifacts", column: "agent_id" }');
  });
});
