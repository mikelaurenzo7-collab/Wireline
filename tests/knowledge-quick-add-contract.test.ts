import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { extractionBodyPersistedSomething } from "../src/lib/training-extraction-result";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("typed knowledge on the Knowledge page", () => {
  it("sits first on the page and shares the import and upload busy fences", () => {
    const page = read("src/pages/KnowledgePage.tsx");
    const editor = page.slice(page.indexOf("export function KnowledgeEditor"));
    expect(editor.indexOf("<KnowledgeQuickAdd")).toBeLessThan(
      editor.indexOf("<WebsiteKnowledgeImport"),
    );
    expect(editor).toContain("disabled={knowledgeBusy || importing}");
    expect(editor).toContain("disabled={knowledgeBusy || teaching}");
    expect(editor).toContain("externallyBusy={importing || teaching}");
  });

  it("saves through the owned training extractor and reports only what was saved", () => {
    const card = read("src/components/training/KnowledgeQuickAdd.tsx");
    expect(card).toContain('authFetch("/api/train/extract"');
    expect(card).toContain("JSON.stringify({ agentId, message })");
    expect(card).toContain("if (!extractionBodyPersistedSomething(body))");
    expect(card).toContain("if (!isCurrent()) return;");
    const route = read("src/routes/agent-routes-v2.ts");
    expect(route).toContain("They now appear under Knowledge.");
    expect(route).not.toContain("readiness panel");
  });

  it("counts a save only when a fact, rule, or tone was persisted", () => {
    expect(extractionBodyPersistedSomething({ readiness: { rules: 0, facts: 2 } })).toBe(true);
    expect(extractionBodyPersistedSomething({ readiness: { rules: 0, facts: 0 } })).toBe(false);
    expect(extractionBodyPersistedSomething({ readiness: { tone: true } })).toBe(true);
    expect(extractionBodyPersistedSomething({ knowledge: ["Open 8-6"] })).toBe(true);
    expect(extractionBodyPersistedSomething(null)).toBe(false);
  });
});
