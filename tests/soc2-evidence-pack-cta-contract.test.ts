import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("SOC2 evidence pack", () => {
  it("keeps the evidence pack mounted and out of the owner's compliance checklist", () => {
    const checklist = read("src/components/admin/ComplianceChecklist.tsx");
    const registry = read("src/server/register-api-routes.ts");
    const soc2 = read("src/routes/soc2-routes.ts");

    // The SOC 2 index is a platform engineering artifact, not an owner task.
    expect(checklist).not.toContain("/api/soc2/evidence-pack");
    expect(checklist).not.toContain("/api/admin/trust-pack/soc2");
    expect(registry).toContain("app.use(soc2Router)");
    expect(soc2).toContain('"/api/soc2/evidence-pack"');
  });
});
