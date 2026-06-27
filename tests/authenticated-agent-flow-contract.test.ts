import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const mojibake = /Â|â|�/;

describe("authenticated agent flow", () => {
  it("keeps Studio, Training, and agent controls discoverable", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    const agentsPage = read("src/pages/AgentsPage.tsx");
    const createDialog = read("src/components/CreateAgentDialog.tsx");
    const mobileUtilities = read("src/components/MobileBrowserUtilities.tsx");

    expect(shell).toContain('label: "Studio"');
    expect(shell).not.toContain('label: "Build"');

    expect(agentsPage).toContain("Create. Train. Run.");
    expect(agentsPage).toContain("section=facts");
    expect(agentsPage).toContain("section=guidance");
    expect(agentsPage).toContain("sub=voices");
    expect(agentsPage).toContain("tab=memory");
    expect(agentsPage).toContain("/settings/billing");

    expect(createDialog).toContain("New agent.");
    expect(createDialog).toContain("Name, role, voice, personality, and a starting brief.");
    expect(createDialog).toContain("Short intake. Train next. Run immediately.");
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

  it("keeps overview and Studio aligned with the create-train-run model", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const studioOverview = read("src/components/StudioOverview.tsx");
    const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");

    expect(overview).toContain("Create -> Train -> Run");
    expect(overview).toContain("WORKSPACE_VOICE");
    expect(overview).toContain("WORKSPACE_VOICE.forgeHeadline");
    expect(overview).toContain("WORKSPACE_VOICE.runHeadline");
    expect(overview).toContain("WORKSPACE_VOICE.emptyCue");
    expect(overview).toContain("wl-composer-dock");
    expect(overview).toContain("Open Studio");
    expect(overview).toContain("Work here.");
    expect(overview).toContain("One voice. Everywhere.");

    expect(studioOverview).toContain("Task it.");
    expect(studioOverview).toContain("placeholder={`Ask ${active.name} to...`}");
    expect(studioOverview).toContain("Open Workroom");
    expect(studioOverview).toContain("Workroom");
    expect(studioOverview).toContain("Forge");
    expect(studioOverview).toContain('to="/settings"');
    expect(studioOverview).toContain("Settings");
    expect(studioOverview).not.toContain("WHAT SHOULD IT DO?");
    expect(studioOverview).not.toContain("Give {active.name} the next job.");
    expect(studioOverview).not.toContain("Tap once to switch");
    expect(studioOverview).not.toContain("Describe the outcome. Approvals stay visible.");
    expect(studioOverview).not.toContain("Ready to direct");

    expect(studioWorkspace).toContain('next.set("mode", "workroom")');
    expect(studioWorkspace).toContain('mode === "workroom" || mode === "assistant"');

    expect(workroom).toContain("Ready.");
    expect(workroom).toContain("Direct the work.");
    expect(workroom).toContain("Draft reply");
    expect(workroom).toContain('to="/settings"');
    expect(workroom).not.toContain("Training holds setup.");
    expect(workroom).not.toContain("Train by talking.");
    expect(workroom).not.toContain("what to learn or do");
  });

  it("makes Training the heavy-configuration surface", () => {
    const app = read("src/App.tsx");
    const trainingPage = read("src/pages/KnowledgePage.tsx");
    const knowledgeWorkspace = read("src/components/KnowledgeWorkspace.tsx");

    expect(app).not.toContain('path="/training" element={<Navigate to="/studio" replace />}');

    expect(trainingPage).toContain("TrainingSurfaceMap");
    expect(trainingPage).toContain("Facts, instructions, sources, voice, test calls, and memory.");
    expect(trainingPage).toContain('label: "Knowledge"');
    expect(trainingPage).toContain('label: "Instructions"');
    expect(trainingPage).toContain('studioSub: "voices"');
    expect(trainingPage).toContain('studioTab: "memory"');
    expect(trainingPage).toContain("AgentAssetUpload");

    expect(knowledgeWorkspace).toContain('params.get("section")');
    expect(knowledgeWorkspace).toContain('updated.set("section", next)');
  });

  it("keeps Studio training tabs visible inside the workroom", () => {
    const agentTraining = read("src/components/AgentTraining.tsx");

    expect(agentTraining).toContain('aria-label="Training views"');
    expect(agentTraining).toContain('label: "Knowledge"');
    expect(agentTraining).toContain('label: "Voice"');
    expect(agentTraining).toContain('label: "Pronunciation"');
    expect(agentTraining).toContain('label: "Test call"');
    expect(agentTraining).toContain('label: "Conversation flow"');
    expect(agentTraining).not.toContain("!onSubTabChange &&");
  });

  it("keeps billing aligned with Conversation Balance", () => {
    const billing = read("src/pages/BillingSettings.tsx");
    const balance = read("src/components/ConversationBalanceCard.tsx");
    const stripeBilling = read("src/components/StripeBillingCard.tsx");

    expect(billing).toContain("Fund the work.");
    expect(billing).toContain("Start free. Fund live work.");
    expect(billing).toContain("Use balance first.");
    expect(billing).toContain("Stripe receipts.");
    expect(balance).toContain(
      "Start free. Add balance when you are ready to run calls, texts, and follow-up.",
    );
    expect(stripeBilling).toContain("Start free, activate Personal with Conversation Balance");

    expect(billing).not.toContain("Build free");
    expect(balance).not.toContain("Build and test for free");
    expect(stripeBilling).not.toContain("Build and test for free");
  });

  it("keeps settings focused on explicit controls", () => {
    const settings = read("src/pages/SettingsPage.tsx");
    const routes = read("src/routes/AppRoutes.tsx");

    expect(settings).toContain("Pick your path.");
    expect(settings).toContain("Billing");
    expect(settings).toContain("Team");
    expect(settings).toContain("Customize");
    expect(settings).toContain("Integrations");
    expect(settings).toContain("Apps");
    expect(settings).toContain("Delete queued.");
    expect(settings).toContain('to="/studio"');
    expect(settings).not.toContain("Set the operating rules.");
    expect(settings).not.toContain("Make every surface feel like one system.");
    expect(settings).not.toContain("Connect, review, remove.");
    expect(settings).not.toContain("Every action has a surface.");
    expect(settings).not.toContain("Exit paths stay obvious.");
    expect(routes).toContain('/settings/customization" element={<CustomizationSettings />}');
  });

  it("gives customization a dedicated authenticated surface", () => {
    const customization = read("src/pages/CustomizationSettings.tsx");

    expect(customization).toContain("One voice, everywhere.");
    expect(customization).toContain("System taste, not screens.");
    expect(customization).toContain("Brand profile");
    expect(customization).toContain("Voice identity");
    expect(customization).toContain("Operating authority");
    expect(customization).toContain("Success targets");
    expect(customization).toContain("Taste travels.");
    expect(customization).toContain("One profile.");
  });

  it("does not ship mojibake in the authenticated first-run path", () => {
    for (const file of [
      "src/components/AgentTraining.tsx",
      "src/components/CreateAgentDialog.tsx",
      "src/components/AgentMemoryPanel.tsx",
      "src/components/StudioOverview.tsx",
      "src/components/AuthPortal.tsx",
      "src/pages/OverviewPage.tsx",
      "src/pages/SettingsPage.tsx",
      "src/pages/BillingSettings.tsx",
      "src/pages/CustomizationSettings.tsx",
      "src/components/ConversationBalanceCard.tsx",
      "src/components/StudioWorkroom.tsx",
      "src/components/layout/AppShell.tsx",
    ]) {
      expect(read(file), file).not.toMatch(mojibake);
    }
  });
});
