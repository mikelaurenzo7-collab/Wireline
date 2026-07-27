import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0117_drop_recap_artifact_deny_policy.sql"),
  "utf8",
);

describe("recap artifact RLS policy cleanup", () => {
  it("drops only the redundant deny policy", () => {
    expect(migration).toContain(
      "DROP POLICY IF EXISTS deny_direct_api_access ON public.wireline_recap_artifacts;",
    );
    expect(migration).not.toMatch(/DROP POLICY[^;]*wireline_server_access/i);
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});
