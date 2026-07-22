import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("SOC2 evidence pack CTA", () => {
  it("opens the mounted evidence-pack route, not a deleted admin trust-pack path", () => {
    const checklist = read("src/components/admin/ComplianceChecklist.tsx");
    const registry = read("src/server/register-api-routes.ts");
    const soc2 = read("src/routes/soc2-routes.ts");

    expect(checklist).toContain('window.open("/api/soc2/evidence-pack"');
    expect(checklist).not.toContain("/api/admin/trust-pack/soc2");
    expect(registry).toContain("app.use(soc2Router)");
    expect(soc2).toContain('"/api/soc2/evidence-pack"');
  });
});
