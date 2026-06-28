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
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");

    // Minimal rail: Studio icon + agent icons + settings
    expect(shell).toContain('aria-label="Agent workspace navigation"');
    expect(shell).toContain("Studio");
    expect(shell).toContain("Settings");

    // Open canvas for creation when no agents
    expect(studioV2).toContain("Wire one.");
    expect(studioV2).toContain("Start with a brief");

    // Agent cards in canvas + full per-agent workspace (chat + grouped Brain/World Connections/Record + integrations inside)
    expect(studioV2).toContain("Your agents");
    expect(studioV2).toContain("Workspace for");
    expect(studioV2).toContain("World Connections");
    expect(studioV2).toContain("Brain");
    expect(studioV2).toContain("per this workspace only");

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
    const studioV2 = read("src/components/StudioWorkspaceV2.tsx");
    const _studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
    const _workroom = read("src/components/StudioWorkroom.tsx");
    const agentStudioHome = read("src/pages/AgentStudioHome.tsx");

    expect(read("src/components/StudioWorkspaceV2.tsx")).toContain("Wire one.");
    expect(studioV2).toContain("Canvas");
    expect(studioV2).toContain("Your agents");
    expect(studioV2).toContain("Workspace for");
    expect(studioV2).toContain("Memory");
    expect(studioV2).toContain("World Connections");

    expect(agentStudioHome).toContain("WorkspaceShell");
    expect(agentStudioHome).toContain("StudioWorkspaceV2");

    expect(read("src/lib/product-copy.ts")).toContain('createHeadline: "Wire an agent."');
    expect(read("src/lib/product-copy.ts")).toContain('emptyCue: "Brief it. Train it. Wire it."');

    // mode support is legacy; current canvas always renders full per-agent workspace with chat prominent
  });
});
