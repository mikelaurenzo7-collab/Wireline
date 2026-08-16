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
    const vercel = JSON.parse(read("vercel.json")) as {
      rewrites?: Array<{ source?: string; destination?: string }>;
    };
    const rewrites = vercel.rewrites ?? [];

    expect(rewrites).toContainEqual({ source: "/recap/:path*", destination: "/api/index.ts" });

    // SPA fallback must exclude the /recap/ prefix so it does not intercept.
    const spaFallback = rewrites.find((rewrite) => rewrite.destination === "/index.html");
    expect(spaFallback?.source).toContain("recap/");
  });

  it("public GET /recap/:slug is signed, distributed-rate-limited, and not session-authenticated", () => {
    const route = read("src/routes/shareable-artifact-routes.ts");
    // Ensure the public handler does not attach authenticateUser.
    const recapBlockMatch = route.match(/router\.get\(\s*"\/recap\/:slug"[\s\S]*?\);/);
    expect(recapBlockMatch).not.toBeNull();
    expect(recapBlockMatch?.[0]).not.toContain("authenticateUser");
    expect(recapBlockMatch?.[0]).toContain("ipRateLimit");
    expect(recapBlockMatch?.[0]).toContain("slugRateLimit");

    // The tokenized route promises anti-enumeration protection. In production,
    // a per-invocation memory fallback or Redis fail-open would make that claim
    // false across serverless instances, so both gates must fail closed.
    expect(route).toContain("distributedLimiterStatus");
    expect(route).toContain("distributedRecapLimiterReady");
    expect(route).toContain("sendLimiterUnavailable");
    expect(route.match(/failClosedOnError: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route).toContain("public recap limiter unavailable, failing closed");
    expect(route).not.toContain("fail open");
  });

  it("owner surfaces (list, revoke) require authentication", () => {
    const route = read("src/routes/shareable-artifact-routes.ts");
    const listMatch = route.match(/router\.get\(\s*"\/api\/recap-artifacts"[\s\S]*?\);/);
    const revokeMatch = route.match(/router\.delete\(\s*"\/api\/recap-artifacts\/:id"[\s\S]*?\);/);
    expect(listMatch?.[0]).toContain("authenticateUser");
    expect(revokeMatch?.[0]).toContain("authenticateUser");
  });
});
