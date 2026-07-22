import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("account holder conversation roles", () => {
  it("keeps Studio workroom inserts on Account Holder, not legacy operator", () => {
    const routes = read("src/routes/agent-workspace-routes.ts");
    const schema = read("src/db/schema.ts");
    const workroom = read("src/components/StudioWorkroom.tsx");

    expect(routes).toContain('role: "Account Holder"');
    expect(routes).not.toMatch(/role:\s*"operator"/);
    expect(schema).toContain('role="Account Holder"');
    expect(workroom).toContain('role: "Account Holder"');
  });

  it("ships an idempotent CHECK migration for Account Holder roles", () => {
    const migration = read("drizzle/migrations/0108_account_holder_conversation_roles.sql");

    expect(migration).toContain("wireline_agent_conversation_messages_role_check");
    expect(migration).toContain("wireline_director_conversation_messages_role_check");
    expect(migration).toContain("CHECK (role IN ('Account Holder', 'agent'))");
    expect(migration).toContain("CHECK (role IN ('Account Holder', 'director'))");
    expect(migration).toContain("WHERE role = 'operator'");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS");
  });
});
