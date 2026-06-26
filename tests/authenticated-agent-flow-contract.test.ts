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

    expect(createDialog).toContain("Name, role, voice, personality, and a starting brief.");
    expect(createDialog).toContain("Create and open Training");
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
    const studioWorkspace = read("src/components/StudioWorkspaceV2.tsx");
    const workroom = read("src/components/StudioWorkroom.tsx");

    expect(overview).toContain("Create -> Train -> Run");
    expect(overview).toContain("Open Studio");
    expect(overview).toContain("Approvals and follow-up");

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

    expect(billing).toContain("Start free. Fund live work.");
    expect(balance).toContain(
      "Start free. Add balance when you are ready to run calls, texts, and follow-up.",
    );
    expect(stripeBilling).toContain("Start free, activate Personal with Conversation Balance");

    expect(billing).not.toContain("Build free");
    expect(balance).not.toContain("Build and test for free");
    expect(stripeBilling).not.toContain("Build and test for free");
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
      "src/components/ConversationBalanceCard.tsx",
      "src/components/StudioWorkroom.tsx",
      "src/components/layout/AppShell.tsx",
    ]) {
      expect(read(file), file).not.toMatch(mojibake);
    }
  });
});
