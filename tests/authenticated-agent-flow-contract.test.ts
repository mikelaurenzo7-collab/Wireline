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

    expect(shell).toContain('label: "Studio"');
    expect(shell).not.toContain('label: "Build"');

    expect(agentsPage).toContain("Create. Train. Run.");
    expect(agentsPage).toContain("section=facts");
    expect(agentsPage).toContain("section=guidance");
    expect(agentsPage).toContain("sub=voices");
    expect(agentsPage).toContain("tab=memory");
    expect(agentsPage).toContain("/settings/billing");
  });

  it("makes Training the heavy-configuration surface", () => {
    const trainingPage = read("src/pages/KnowledgePage.tsx");
    const knowledgeWorkspace = read("src/components/KnowledgeWorkspace.tsx");

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

  it("does not ship mojibake in the authenticated first-run path", () => {
    for (const file of [
      "src/components/AgentTraining.tsx",
      "src/components/CreateAgentDialog.tsx",
      "src/components/AgentMemoryPanel.tsx",
      "src/components/StudioOverview.tsx",
    ]) {
      expect(read(file), file).not.toMatch(mojibake);
    }
  });
});
