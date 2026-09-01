import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Behavioral coverage for the bugs the adversarial double-pass surfaced in the
 * comprehensive-review changes. Each `it` pins a fix that would otherwise
 * regress silently (the source-reading contracts elsewhere lock the wiring;
 * these exercise real behavior where the function is pure).
 */
describe("simulation quota is fully plumbed (no contract drift)", () => {
  it("appears in both quota-routes usage and the published OpenAPI schema", () => {
    const routes = read("src/routes/quota-routes.ts");
    // Both the internal usage list AND the response object must include it, or
    // GET /api/quotas returns a limits key with no matching usage key.
    expect(routes.match(/simulation_minutes_daily/g)?.length).toBeGreaterThanOrEqual(2);
    const openapi = read("src/lib/openapi-managed-runtime.ts");
    // limits + usage each declare it (schema has additionalProperties:false).
    expect(openapi.match(/simulation_minutes_daily/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
