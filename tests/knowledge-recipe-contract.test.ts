import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const assetRoute = read("src/routes/agent-routes-v2.ts");
const websiteRoute = read("src/routes/website-knowledge-routes.ts");

describe("Knowledge recipe endpoint contracts", () => {
  it("imports supported PDF, Word, and Excel documents through the owned asset route", () => {
    expect(assetRoute).toContain('"/api/agent-config/:id/assets"');
    expect(assetRoute).toContain("extractKnowledgeDocumentWithOpenAI");
    expect(assetRoute).toContain("factsAdded: saved.knowledge.length");
    expect(assetRoute).toContain("rulesAdded: saved.directives.length");
  });

  it("imports one public page through the supported OpenAI training route", () => {
    expect(websiteRoute).toContain('"/api/agent-config/:id/website"');
    expect(websiteRoute).toContain("importWebsiteKnowledge");
    expect(websiteRoute).toContain("sourceUrl: result.sourceUrl");
  });
});
