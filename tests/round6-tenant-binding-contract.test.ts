import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 agent-create capacity serialization", () => {
  it("serializes the mobile create path the same way the web path is", () => {
    // Reading the count outside the transaction let concurrent mobile creates
    // all observe the same pre-insert total and every one of them clear the cap.
    const mobile = read("src/routes/mobile-routes.ts");
    const create = mobile.slice(
      mobile.indexOf('"/api/mobile/agents",'),
      mobile.indexOf('router.get(\n  "/api/mobile/agents"'),
    );
    const lockIdx = create.indexOf("pg_advisory_xact_lock");
    const rosterIdx = create.indexOf("const existingAgents = await tx");
    const insertIdx = create.indexOf("tx.insert(schema.agents)");

    expect(lockIdx).toBeGreaterThan(-1);
    expect(rosterIdx).toBeGreaterThan(lockIdx);
    expect(insertIdx).toBeGreaterThan(rosterIdx);
    expect(create).toContain("AGENT_CAPACITY_REACHED");
  });
});
