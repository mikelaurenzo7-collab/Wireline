import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("shareable-artifact route registration and public allowlist", () => {
  it("mounts the shareable artifact router in the primary API registry", () => {
    const registry = read("src/server/register-api-routes.ts");
    expect(registry).toContain(
      'import shareableArtifactRouter from "../routes/shareable-artifact-routes"',
    );
    expect(registry).toContain("app.use(shareableArtifactRouter)");
  });

  it("keeps /recap/:slug on the public authz allowlist with a specific reason", () => {
    const generator = read("scripts/generate-authz-matrix.ts");
    expect(generator).toContain("/^\\/recap\\/:slug$/");
    expect(generator).toMatch(/Signed shareable call\/weekly recap/);
  });

  it("routes /recap/:path* to the API function in vercel.json", () => {
    const vercel = read("vercel.json");
    expect(vercel).toContain('"source": "/recap/:path*"');
    expect(vercel).toContain('"destination": "/api/index.ts"');
    // SPA fallback must exclude the /recap/ prefix so it does not intercept.
    expect(vercel).toContain("|recap/|");
  });

  it("public GET /recap/:slug is not authenticated in the route handler", () => {
    const route = read("src/routes/shareable-artifact-routes.ts");
    // Ensure the public handler does not attach authenticateUser.
    const recapBlockMatch = route.match(/router\.get\(\s*"\/recap\/:slug"[\s\S]*?\);/);
    expect(recapBlockMatch).not.toBeNull();
    expect(recapBlockMatch?.[0]).not.toContain("authenticateUser");
    // Rate limiters are present.
    expect(recapBlockMatch?.[0]).toContain("ipRateLimit");
    expect(recapBlockMatch?.[0]).toContain("slugRateLimit");
  });

  it("owner surfaces (list, revoke) require authentication", () => {
    const route = read("src/routes/shareable-artifact-routes.ts");
    const listMatch = route.match(/router\.get\(\s*"\/api\/recap-artifacts"[\s\S]*?\);/);
    const revokeMatch = route.match(/router\.delete\(\s*"\/api\/recap-artifacts\/:id"[\s\S]*?\);/);
    expect(listMatch?.[0]).toContain("authenticateUser");
    expect(revokeMatch?.[0]).toContain("authenticateUser");
  });
});
