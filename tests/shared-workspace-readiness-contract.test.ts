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

  it("enforces certification inside generic authentication and session rotation", () => {
    const middleware = read("src/middleware/auth.ts");
    expect(middleware).toContain('if (!sharedWorkspacesEnabled())');
    expect(middleware).toContain(
      '"Ignoring shared tenant selection before data-plane certification"',
    );
    expect(middleware).toContain("isNotNull(secureTeamMembers.acceptedAt)");
    expect(middleware).toContain("attachValidatedTenant(authedReq, tenantId)");

    const sessions = read("src/routes/auth-session-hardening-routes.ts");
    expect(sessions).toContain("!sharedWorkspacesEnabled()");
    expect(sessions).toContain("isNotNull(secureTeamMembers.acceptedAt)");
  });

  it("explains the certification state instead of silently disabling collaboration", () => {
    const page = read("src/pages/TeamSettings.tsx");
    expect(page).toContain('payload?.code === "SHARED_WORKSPACES_NOT_CERTIFIED"');
    expect(page).toContain('setTeamAccess("certifying")');
    expect(page).toContain('title="Shared workspaces are being certified"');
    expect(page).toContain("tenant-isolation and permission certification");
    expect(page).toContain('teamAccess === "ok"');
    expect(page).toContain("data-wireline-preserve-case");
  });

  it("surfaces canonical API errors from invitation attempts", () => {
    const page = read("src/pages/TeamSettings.tsx");
    expect(page).toContain(
      'payload?.error || payload?.message || "Invite could not be sent."',
    );
  });
});
