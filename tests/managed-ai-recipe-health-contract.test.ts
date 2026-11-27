import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const route = read("src/routes/ai-status-routes.ts");
const registry = read("src/server/register-api-routes.ts");

describe("managed AI recipe availability", () => {
  it("uses a real provider-neutral status contract instead of the dead Claude route", () => {
    expect(route).toContain('router.get("/api/ai/status", authenticateUser');
    expect(route).toContain('primary_provider: "gateway"');
    expect(route).toContain("STRUCTURED_PRIMARY_MODEL");
    expect(registry).toContain("app.use(aiStatusRouter)");
  });
});
