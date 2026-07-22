import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("templates custom-agent CTA", () => {
  it("routes custom creates through Studio Fast Start, not retired /api/claude forge", () => {
    const templates = read("src/components/AgentTemplates.tsx");

    expect(templates).toContain('navigate("/studio?create=1")');
    expect(templates).toContain("Create in Studio");
    expect(templates).not.toContain("ClaudeRecipeButton");
    expect(templates).not.toContain("/api/claude/forge");
    expect(templates).not.toContain('recipe="agent-wire"');
  });

  it("keeps the managed AI status contract separate from deleted Claude recipe mounts", () => {
    const registry = read("src/server/register-api-routes.ts");
    expect(registry).toContain("app.use(aiStatusRouter)");
    expect(registry).not.toMatch(/claude-routes|claudeRouter|\/api\/claude/);
  });

  it("fails knowledge-crawl enqueue closed while URL ingestion is unavailable", () => {
    const jobs = read("src/routes/job-routes.ts");
    const brains = read("src/lib/ai-brains.ts");
    expect(brains).toContain("class KnowledgeIngestionUnavailableError");
    expect(jobs).toContain("KnowledgeIngestionUnavailableError");
    expect(jobs).toContain('throw AppError.fromHttpStatus(503, new KnowledgeIngestionUnavailableError().message)');
    expect(jobs).not.toContain('type: "knowledge_from_url"');
  });
});
