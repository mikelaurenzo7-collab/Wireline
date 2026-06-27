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

    expect(shell).toContain('label: "Studio"');
    expect(shell).not.toContain('label: "Build"');

    expect(agentsPage).toContain("Create. Train. Run.");
    expect(agentsPage).toContain("section=facts");
    expect(agentsPage).toContain("section=guidance");
    expect(agentsPage).toContain("sub=voices");
    expect(agentsPage).toContain("tab=memory");
    expect(agentsPage).toContain("/settings/billing");

    expect(createDialog).toContain("Start with the job.");
    expect(createDialog).toContain("Give it a name, a role, and a first useful outcome.");
    expect(createDialog).toContain("Create and train");
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
    expect(onboardingFlow).toContain("Opening Create Agent");
    expect(onboardingFlow).toContain("Fresh signups go straight into the short intake.");
    expect(onboardingFlow).not.toContain("Link your phone");
  });

  it("keeps overview and Studio aligned with the create-train-run model", () => {
    const overview = read("src/pages/OverviewPage.tsx");
    const studioOverview = read("src/components/StudioOverview.tsx");
    const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");

    expect(overview).toContain("Create -> Train -> Run");
    expect(overview).toContain("Next best move");
    expect(overview).toContain("Create, train, then run without guessing.");
    expect(overview).toContain("Short intake");
    expect(overview).toContain("Make it trustworthy");
    expect(overview).toContain("Direct live work");
    expect(overview).toContain("Open Studio");
    expect(overview).toContain("Approvals and follow-up");
    expect(overview).toContain("Brand, voice, and authority");

    expect(studioOverview).toContain("Give {active.name} the next job.");
    expect(studioOverview).toContain("Ready to direct");
    expect(studioOverview).toContain("Open workroom");
    expect(studioOverview).toContain("Tap once to switch");
    expect(studioOverview).not.toContain("WHAT SHOULD IT DO?");

    expect(studioWorkspace).toContain('next.set("mode", "workroom")');
    expect(studioWorkspace).toContain('mode === "workroom" || mode === "assistant"');

    expect(workroom).toContain("Direct the work.");
    expect(workroom).toContain(
      "Run calls, draft texts, queue follow-up, review approvals, and prepare handoff.",
    );
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

    expect(billing).toContain("Fund the work. Keep the ledger clean.");
    expect(billing).toContain("Start free. Fund live work.");
    expect(billing).toContain("Use balance first.");
    expect(billing).toContain("Stripe keeps the receipt.");
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

    expect(settings).toContain("Set the operating rules.");
    expect(settings).toContain("Customization");
    expect(settings).toContain("Make every surface feel like one system.");
    expect(settings).toContain("One profile everywhere.");
    expect(settings).toContain("Sound intentional.");
    expect(settings).toContain("Show where autonomy stops.");
    expect(settings).toContain("Give the system a target.");
    expect(settings).toContain("Connect, review, remove.");
    expect(settings).toContain("Only what the job needs.");
    expect(settings).toContain("Every action has a surface.");
    expect(settings).toContain("Exit paths stay obvious.");
    expect(settings).toContain("Account deletion");
    expect(routes).toContain('/settings/customization" element={<CustomizationSettings />}');
  });

  it("gives customization a dedicated authenticated surface", () => {
    const customization = read("src/pages/CustomizationSettings.tsx");

    expect(customization).toContain("One profile for brand, voice, rules, and goals.");
    expect(customization).toContain("Customize the system, not just a screen.");
    expect(customization).toContain("Brand profile");
    expect(customization).toContain("Voice identity");
    expect(customization).toContain("Operating authority");
    expect(customization).toContain("Success targets");
    expect(customization).toContain("Same taste, every surface.");
    expect(customization).toContain("Customization contract");
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
