import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manager = readFileSync("src/components/DncManager.tsx", "utf8");
const routes = readFileSync("src/routes/compliance-routes.ts", "utf8");

describe("DNC route contract", () => {
  it("keeps the compliance UI aligned with the mounted API routes", () => {
    expect(manager).toContain('authFetch("/api/dnc")');
    expect(manager).toContain("authFetch(`/api/dnc/${id}`");
    expect(routes).toContain('router.get("/api/dnc"');
    expect(routes).toContain('router.post("/api/dnc"');
    expect(routes).toContain('"/api/dnc/:id"');
    expect(routes).toContain('"/api/tcpa/consent-check"');
  });
});
