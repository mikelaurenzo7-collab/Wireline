import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const documentForm = read("src/components/recipes/forms/KnowledgeFromDocumentForm.tsx");
const urlForm = read("src/components/recipes/forms/KnowledgeFromUrlForm.tsx");
const assetRoute = read("src/routes/agent-routes-v2.ts");
const websiteRoute = read("src/routes/website-knowledge-routes.ts");

describe("Knowledge recipe endpoint contracts", () => {
  it("imports supported PDF, Word, and Excel documents through the owned asset route", () => {
    expect(documentForm).toContain('accept=".pdf,.docx,.xlsx"');
    expect(documentForm).toContain("PDF, Word DOCX, or Excel XLSX");
    expect(documentForm).toContain(
      '"/api/agent-config/" + encodeURIComponent(agentId) + "/assets"',
    );
    expect(documentForm).toContain("KNOWLEDGE_ASSET_MAX_BYTES");
    expect(documentForm).toContain("KNOWLEDGE_ASSET_MAX_LABEL");
    expect(documentForm).not.toContain("/api/claude/");
    expect(assetRoute).toContain('"/api/agent-config/:id/assets"');
    expect(assetRoute).toContain("extractKnowledgeDocumentWithOpenAI");
    expect(assetRoute).toContain("factsAdded: extraction.knowledge.length");
    expect(assetRoute).toContain("rulesAdded: extraction.directives.length");
  });

  it("imports one public page through the supported OpenAI training route", () => {
    expect(urlForm).toContain('"/api/agent-config/" + encodeURIComponent(agentId) + "/website"');
    expect(urlForm).toContain("body: JSON.stringify({ url: url.trim() })");
    expect(urlForm).toContain("Import one public HTTPS page.");
    expect(urlForm).not.toContain("/api/claude/");
    expect(urlForm).not.toContain("/api/jobs/knowledge-crawl");
    expect(websiteRoute).toContain('"/api/agent-config/:id/website"');
    expect(websiteRoute).toContain("importWebsiteKnowledge");
    expect(websiteRoute).toContain("sourceUrl: result.sourceUrl");
  });
});
