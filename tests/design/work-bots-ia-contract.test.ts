import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOBILE_MORE_NAV,
  MOBILE_PRIMARY_NAV,
  OPERATE_NAV,
  WORKSPACE_NAV,
  desktopNavParentHref,
  isMobilePrimaryActive,
  scopedWorkspaceHref,
  workspacePageTitle,
} from "../../src/constants/navigation";
import { isWorkspaceRoute } from "../../src/lib/workspace-route-scope";

const routes = readFileSync("src/routes/AppRoutes.tsx", "utf8");
const botPage = readFileSync("src/pages/BotsPage.tsx", "utf8");
const shell = readFileSync("src/components/WorkspaceShell.tsx", "utf8");
const details = readFileSync("src/components/studio/BotDetailsMenu.tsx", "utf8");
const header = readFileSync("src/components/marketing/PrecisionPublicHeader.tsx", "utf8");

describe("Work and Bots information architecture", () => {
  it("uses Work for execution and Bots for persistent resource management", () => {
    expect(WORKSPACE_NAV[0]).toMatchObject({ href: "/studio", label: "Work" });
    expect(OPERATE_NAV.map((item) => item.href)).not.toContain("/bots");
    expect(workspacePageTitle("/studio")).toBe("Work");
    expect(workspacePageTitle("/bots")).toBe("Bots");
    expect(desktopNavParentHref("/computer")).toBe("/studio");
    expect(scopedWorkspaceHref("/computer", "agent-1")).toBe("/studio?panel=computer&agent=agent-1");
  });

  it("provides a dedicated signed-in route without breaking /studio deep links", () => {
    expect(isWorkspaceRoute("/bots")).toBe(true);
    expect(routes).toContain('<Route path="/bots" element={<BotsPage />} />');
    expect(routes).toContain('<Route path="/studio" element={<AgentStudioHome />} />');
    expect(routes).toContain('<Route path="/agents" element={<ToStudioRedirect />} />');
    expect(botPage).toContain('to="/studio?create=1"');
    expect(botPage).toContain("&section=setup");
  });

  it("keeps the phone dock focused while making bot management discoverable", () => {
    expect(MOBILE_PRIMARY_NAV.map((item) => item.href)).not.toContain("/bots");
    expect(MOBILE_MORE_NAV.map((item) => item.href)).not.toContain("/bots");
    expect(isMobilePrimaryActive("/bots", "/studio")).toBe(true);
    expect(header).not.toContain("ml-auto hidden items-center gap-1 md:flex");
    expect(header).toContain('to="/pricing"');
    expect(botPage).toContain("agents.map");
    expect(shell).toContain("visibleBots.map");
    expect(shell).toContain('WORKSPACE_NAV.filter((item) => item.href !== "/studio")');
    expect(details).toContain("agents.map");
    expect(details).toContain("Add another Bot");
    expect(details).toContain("Calls and number");
    expect(details).toContain("Knowledge");
    expect(details).toContain("Computer");
  });
});
