import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("shared workspace readiness posture", () => {
  it("fails closed unless the exact data-plane certification value is present", () => {
    const readiness = read("src/lib/shared-workspace-readiness.ts");
    expect(readiness).toContain(
      'SHARED_WORKSPACE_CERTIFICATION = "shared-workspace-data-plane-v1"',
    );
    expect(readiness).toContain("WIRELINE_SHARED_WORKSPACES_CERTIFICATION");
    expect(readiness).toContain("SHARED_WORKSPACES_NOT_CERTIFIED");
    expect(readiness).not.toContain('=== "true"');
  });

  it("mounts the terminal readiness owner before canonical team routes", () => {
    const registry = read("src/server/register-api-routes.ts");
    const guard = registry.indexOf("app.use(sharedWorkspaceReadinessRouter)");
    const team = registry.indexOf("app.use(teamRouter)");
    expect(guard).toBeGreaterThan(-1);
    expect(team).toBeGreaterThan(guard);

    const route = read("src/routes/shared-workspace-readiness-routes.ts");
    expect(route).toContain(
      'router.use("/api/team", authenticateUser, requireCertifiedSharedWorkspaces)',
    );
  });
});
