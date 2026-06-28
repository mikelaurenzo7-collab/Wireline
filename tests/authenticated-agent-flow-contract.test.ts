import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("authenticated agent flow", () => {
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

  it("keeps studio as the authenticated run surface entry", () => {
    const appRoutes = read("src/routes/AppRoutes.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const productCopy = read("src/lib/product-copy.ts");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");

    expect(appRoutes).toContain('path="/studio" element={<AgentStudioHome');
    expect(createDialog).toContain("Create agent");
    expect(productCopy).toContain('createHeadline: "Wire an agent."');
    expect(productCopy).toContain('emptyCue: "Brief it. Train it. Wire it."');

    expect(mobileUtilities).toContain('pathname === "/studio"');
    expect(mobileUtilities).toContain('pathname.startsWith("/studio/")');
    expect(mobileUtilities).toContain('pathname.startsWith("/settings")');
  });
});
