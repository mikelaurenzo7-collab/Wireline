import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// scripts/check-deployment-boundaries.mjs runs inside every Vercel build and
// fails any preview build that can see credential-like configuration or the
// production Stripe catalog. Any launch audit that demands those same keys on
// the preview target is therefore mutually unsatisfiable with the build gate:
// "fixing" one gate breaks the other, and the launch decision flips on which
// script ran last. Production is the only coverage target an audit may require.
describe("Vercel env target policy stays mutually satisfiable", () => {
  it("the build-time boundary gate keeps preview credential-free", () => {
    const boundaries = read("scripts/check-deployment-boundaries.mjs");
    expect(boundaries).toContain('"POSTGRES_URL"');
    expect(boundaries).toContain("production-only configuration must not be available to preview");
    expect(boundaries).toContain("the production Stripe catalog must not be available to preview");
  });

  it("launch status requires production coverage only for parity keys", () => {
    const status = read("scripts/generate-launch-status.mjs");
    expect(status).toContain('const requiredTargets = ["production"];');
    expect(status).toContain("check-deployment-boundaries.mjs");
    expect(status).toContain("CANONICAL_PROJECT_ID");
    expect(status).toContain("CANONICAL_TEAM_ID");
    for (const marker of ["CLIENT_SECRET", "DATA_KEY", "SECRET(?:_KEY)?"]) {
      expect(status).toContain(marker);
    }
  });

  it("the env health audit requires production coverage only", () => {
    const health = read("scripts/check-vercel-env-health.mjs");
    expect(health).toContain(
      'const missingTargets = ["production"].filter((t) => !covered.has(t));',
    );
    expect(health).toContain("check-deployment-boundaries.mjs");
  });
});
