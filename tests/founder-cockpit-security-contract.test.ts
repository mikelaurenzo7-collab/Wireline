import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("founder cockpit security contract", () => {
  it("mounts founder APIs with requireFounderCockpit in the production registry", () => {
    const routes = read("src/routes/founder-cockpit-routes.ts");
    const registry = read("src/server/register-api-routes.ts");

    expect(registry).toContain("founderCockpitRouter");
    expect(routes).toContain("requireFounderCockpit");
    expect(routes).toContain('"/api/founder/cockpit"');
    expect(routes).toContain('"/api/founder/launch-readiness"');
    expect(routes).not.toContain("requirePlatformAdmin");
  });

  it("never exposes cockpit in tenant Admin settings", () => {
    const admin = read("src/components/AdminSettings.tsx");
    expect(admin).not.toContain('activeTab === "cockpit"');
    expect(admin).not.toContain("FounderOperatingCockpit");
    expect(admin).toContain('user?.founder_cockpit ? "/founder"');
  });

  it("gates founder navigation on founder_cockpit, not is_owner", () => {
    const sidebar = read("src/components/layout/Sidebar.tsx");
    const workspaceSidebar = read("src/components/layout/WorkspaceSidebar.tsx");
    expect(sidebar).toContain("user?.founder_cockpit");
    expect(workspaceSidebar).toContain("user?.founder_cockpit");
    expect(sidebar).not.toMatch(/Founder[\s\S]{0,120}user\?\.is_owner/);
  });

  it("documents founder cockpit routes in the authz matrix", () => {
    const matrix = read("docs/AUTHZ_MATRIX.md");
    expect(matrix).toContain("founder-cockpit-routes.ts");
    expect(matrix).toContain("| `/api/founder/cockpit`");
    expect(matrix).toContain("founder_cockpit");
  });
});
