import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const modal = read("src/components/recipes/RecipeModal.tsx");
const route = read("src/routes/ai-status-routes.ts");
const registry = read("src/server/register-api-routes.ts");

describe("managed AI recipe availability", () => {
  it("uses a real provider-neutral status contract instead of the dead Claude route", () => {
    expect(modal).toContain('authFetch("/api/ai/status")');
    expect(modal).toContain('status.primary_provider === "openai"');
    expect(modal).not.toContain('/api/claude/status');
    expect(route).toContain('router.get("/api/ai/status", authenticateUser');
    expect(route).toContain('primary_provider: "openai"');
    expect(route).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(registry).toContain("app.use(aiStatusRouter)");
  });

  it("keeps session startup and modal teardown separate from runtime outages", () => {
    expect(modal).toContain("statusRes.status === 401");
    expect(modal).toContain("if (cancelled) return");
    expect(modal).toContain("cancelled = true");
  });
});
