import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { extractionBodyPersistedSomething } from "../src/lib/training-extraction-result";
import { WORKSPACE_FIELDS } from "../src/lib/workspace-planner";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * One place to teach, one place to look. The owner types knowledge by telling
 * the Bot in the Workspace chat. The Knowledge page is the library of what the
 * Bot knows, and Set Up says how much it knows without a second typing box.
 */
describe("Knowledge is the library; the chat is where the owner teaches", () => {
  it("keeps the Knowledge page free of a typed knowledge box", () => {
    const page = read("src/pages/KnowledgePage.tsx");
    const editor = page.slice(page.indexOf("export function KnowledgeEditor"));
    expect(page).not.toContain("KnowledgeQuickAdd");
    expect(page).not.toContain("/api/train/extract");
    expect(editor.indexOf("<WebsiteKnowledgeImport")).toBeLessThan(
      editor.indexOf("<KnowledgeBaseClaude"),
    );
    expect(editor.indexOf("<KnowledgeBaseClaude")).toBeLessThan(
      editor.indexOf("<AboutYouMemories"),
    );
    expect(editor).toContain("disabled={knowledgeBusy}");
    expect(editor).toContain("externallyBusy={importing}");
    expect(page).toContain("To teach it something new, tell it in chat.");
    expect(page).toContain("Teach in Chat");
  });

  it("keeps Set Up to how the Bot works and points at Knowledge", () => {
    const setup = read("src/components/StudioAgentWorkspacePanel.tsx");
    expect(setup).not.toContain("setup-knowledge");
    expect(setup).not.toContain("/api/train/extract");
    expect(setup).toContain("To teach it something new, tell it in chat.");
    expect(setup).toContain("Open Knowledge");
    expect(read("src/lib/studio-setup-drafts.ts")).not.toContain("knowledge");
  });

  it("lets the chat save facts and notes about the owner, each through one reviewed card", () => {
    expect(WORKSPACE_FIELDS.business_fact).toMatchObject({ kind: "knowledge", column: null });
    expect(WORKSPACE_FIELDS.owner_memory).toMatchObject({ kind: "memory", column: null });
    const routes = read("src/routes/agent-workspace-routes.ts");
    expect(routes).toContain('if (spec.kind === "memory")');
    expect(routes).toContain('} else if (spec.kind === "knowledge")');
    expect(routes).toContain(
      "addOwnerMemoryInTransaction(tx, req.user.id, agentId, String(value))",
    );
  });

  it("shows About You as a list the owner can review and forget, not a second input", () => {
    const about = read("src/components/training/AboutYouMemories.tsx");
    expect(about).toContain('method: "DELETE"');
    expect(about).not.toContain('method: "POST"');
    expect(about).not.toContain("<textarea");
    expect(read("src/components/studio/StudioBotDetailsPanel.tsx")).not.toContain("Memory");
    expect(read("src/lib/owner-memory.ts")).toContain("in Knowledge under About You");
  });

  it("reports only what the training extractor saved", () => {
    const route = read("src/routes/agent-routes-v2.ts");
    expect(route).toContain("They now appear under Knowledge.");
    expect(route).not.toContain("readiness panel");
  });

  it("accepts new or previously saved training and leaves a non-result pending", () => {
    expect(extractionBodyPersistedSomething({ readiness: { rules: 0, facts: 2 } })).toBe(true);
    expect(extractionBodyPersistedSomething({ readiness: { rules: 0, facts: 0 } })).toBe(false);
    expect(extractionBodyPersistedSomething({ readiness: { tone: true } })).toBe(true);
    expect(
      extractionBodyPersistedSomething({ alreadySaved: true, readiness: { rules: 0, facts: 0 } }),
    ).toBe(true);
    expect(extractionBodyPersistedSomething({ knowledge: ["Open 8-6"] })).toBe(true);
    expect(extractionBodyPersistedSomething(null)).toBe(false);
  });
});
