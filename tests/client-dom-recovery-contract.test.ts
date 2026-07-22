import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("homepage DOM reconciliation recovery", () => {
  it("groups browser errors and protects against reload loops", () => {
    const recovery = read("src/lib/dom-reconciliation-recovery.ts");
    const boundary = read("src/components/ErrorBoundary.tsx");
    const health = read("src/routes/health-routes.ts");

    expect(recovery).toContain("removeChild");
    expect(recovery).toContain("sessionStorage");
    expect(recovery).toContain("RELOAD_GUARD_MS");
    expect(boundary).toContain("requestDomReconciliationReload");
    expect(health).toContain('createHash("sha256")');
    expect(health).toContain("componentTop");
    expect(health).toContain("fingerprint");
  });
});
