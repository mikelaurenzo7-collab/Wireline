import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("knowledge entry management", () => {
  const surface = read("src/components/KnowledgeBaseClaude.tsx");
  const routes = read("src/routes/knowledge-routes.ts");

  it("lets a customer edit a saved entry through the registered owner-scoped route", () => {
    expect(routes).toContain('"/api/knowledge/:id"');
    expect(routes).toContain("eq(schema.knowledge.userId, req.user.id)");
    expect(surface).toContain('method: "PATCH"');
    expect(surface).toContain("body: JSON.stringify({ content })");
    expect(surface).toContain("maxLength={10_000}");
    expect(surface).toContain("Knowledge updated.");
  });

  it("requires an explicit confirmation before removing a saved entry", () => {
    expect(surface).toContain("confirmDeleteKnowledgeId === rowId");
    expect(surface).toContain("Remove this entry?");
    expect(surface).toContain('method: "DELETE"');
    expect(surface).toContain("Knowledge removed.");
    expect(routes).toContain("if (!deleted.length)");
  });
});
