import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const _mojibake = /Â|â|�/;

describe("authenticated agent flow", () => {
  it("keeps Studio canvas and per-agent workspaces discoverable with minimal rail", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const studioV2 = read("src/components/StudioWorkspaceV2.tsx");
    const workspacePanel = read("src/components/StudioAgentWorkspacePanel.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");

    // Minimal rail: logo + settings; agents live in the top/bottom switcher bar
    expect(shell).toContain('aria-label="Workspace navigation"');
    expect(shell).toContain("StudioAgentBar");
    expect(shell).toContain('aria-label="Agent switcher"');
    expect(shell).toContain('role="tablist"');
    expect(shell).toContain("useRovingTabIndex");
    expect(shell).toMatch(/function AgentSwitcherPill[\s\S]*min-h-\[44px\]/);
    expect(shell).toContain("scrollIntoView");
    expect(shell).toContain("NativeStudioAgentBar");
    expect(shell).toMatch(/isStudioRoute && nativeAppShell[\s\S]*NativeStudioAgentBar/);
    expect(shell).toContain("Settings");

    // Open canvas for creation when no agents
    expect(studioV2).toContain("Wire one.");
    expect(studioV2).toContain("Start with a brief");

    // Chat-first canvas orchestrator + extracted workspace panel behind view=workspace
    expect(studioV2).toContain("StudioAgentWorkspacePanel");
    expect(studioV2).toContain('view") === "workspace"');
    expect(studioV2).toContain("onTestVoiceInChat");
    expect(studioV2).not.toContain("document.querySelector");
    expect(studioV2).not.toContain("alert(");

    expect(workspacePanel).toContain("Workspace for");
    expect(workspacePanel).toContain("World Connections");
    expect(workspacePanel).toContain("Brain");
    expect(workspacePanel).toContain("per this agent's workspace");
    expect(workspacePanel).toContain("/api/agent-config/");
    expect(workspacePanel).toContain("/api/train/extract");
    expect(workspacePanel).not.toContain("document.querySelector");
    expect(workspacePanel).not.toContain("alert(");

    expect(createDialog).toContain("Create agent");

    expect(mobileUtilities).toContain('pathname === "/studio"');
    expect(mobileUtilities).toContain('pathname.startsWith("/studio/")');
    expect(mobileUtilities).toContain('pathname.startsWith("/settings")');
  });

  it("routes fresh signups into the real create flow", () => {
    const authPortal = read("src/components/AuthPortal.tsx");
    const authRedirect = read("src/lib/auth-redirect.ts");
    const onboardingFlow = read("src/pages/OnboardingFlow.tsx");

    expect(authPortal).toContain(
      'preferredPlanId: nextMode === "business" ? "business" : "personal"',
    );
    expect(authRedirect).toContain(
      'workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1"',
    );
    expect(onboardingFlow).toContain("Opening your first agent");
    expect(onboardingFlow).toContain("Taking you straight to the brief");
    expect(onboardingFlow).toContain('label: "Workspace"');
    expect(onboardingFlow).toContain('label: "Next"');
    expect(onboardingFlow).toContain('label: "Continue now"');
    expect(onboardingFlow).not.toContain("Link your phone");
  });

  it("keeps the canvas and per-agent workspaces aligned with create + full agent workspace model", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const studioV2 = read("src/components/StudioWorkspaceV2.tsx");
    const workspacePanel = read("src/components/StudioAgentWorkspacePanel.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");
    const agentStudioHome = read("src/pages/AgentStudioHome.tsx");

    expect(studioV2).toContain("Wire one.");
    expect(shell).toContain("Canvas");
    expect(studioV2).toContain("StudioAgentWorkspacePanel");
    expect(workspacePanel).toContain("Workspace for");
    expect(workspacePanel).toContain("Memory");
    expect(workspacePanel).toContain("World Connections");
    expect(workroom).toContain("StudioWorkroomHandle");
    expect(workroom).toContain("focusComposer");

    expect(agentStudioHome).toContain("WorkspaceShell");
    expect(agentStudioHome).toContain("StudioWorkspaceV2");

    expect(read("src/lib/product-copy.ts")).toContain('createHeadline: "Wire an agent."');
    expect(read("src/lib/product-copy.ts")).toContain('emptyCue: "Brief it. Train it. Wire it."');

    expect(studioV2).toContain('params.get("mode")');
    expect(studioV2).toContain('next.delete("mode")');
    expect(studioV2).not.toContain("mode=workroom");
    expect(read("src/pages/OverviewPage.tsx")).not.toContain("mode=workroom");
    expect(read("src/components/StudioOverview.tsx")).not.toContain("mode=workroom");
    expect(workspacePanel).not.toContain("mode=workroom");
  });
});
