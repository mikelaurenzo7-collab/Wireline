import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const route = read("src/routes/ai-status-routes.ts");
const registry = read("src/server/register-api-routes.ts");

describe("managed AI availability status", () => {
  it("serves a real provider-neutral status contract instead of the dead Claude route", () => {
    // Availability must not be coupled to any single provider id — the managed
    // chain (OpenAI primary, Gemini, AI Gateway) can serve regardless.
    expect(route).toContain('router.get("/api/ai/status", authenticateUser');
    expect(route).toContain('primary_provider: "openai"');
    expect(route).toContain("STRUCTURED_PRIMARY_MODEL");
    expect(route).not.toContain("/api/claude/status");
    expect(registry).toContain("app.use(aiStatusRouter)");
  });
});
