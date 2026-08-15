import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const promotionSource = readFileSync("scripts/promote-vercel-production.mjs", "utf8");
const buildSource = readFileSync("scripts/vercel-build.mjs", "utf8");

describe("production promotion safety", () => {
  it("never treats a preview artifact as a production release candidate", () => {
    expect(buildSource).toContain('environment === "production"');
    expect(buildSource).toContain('run("npm", ["run", "db:migrate"]);');
    expect(promotionSource).toContain('deployment.target !== "production"');
    expect(promotionSource).toContain("Refusing to promote a preview artifact");
  });

  it("pins the candidate to main, this project, READY state, and an exact SHA", () => {
    expect(promotionSource).toContain("projectId !== PROJECT_ID");
    expect(promotionSource).toContain('state !== "READY"');
    expect(promotionSource).toContain('commitRef !== "main"');
    expect(promotionSource).toContain("WIRELINE_EXPECTED_COMMIT_SHA");
    expect(promotionSource).toContain("/^[0-9a-f]{40}$/i");
    expect(promotionSource).toContain(
      "commitSha.toLowerCase() !== expectedCommitSha.toLowerCase()",
    );
  });

  it("cannot disable exact-head migrations on the canonical production build", () => {
    expect(buildSource).toContain("if (isCanonicalProduction && migrationsDisabled)");
    expect(buildSource).toContain(
      "Refusing canonical production build with WIRELINE_RUN_MIGRATIONS=false",
    );
    expect(buildSource).toContain('run("npm", ["run", "db:migrate"])');
    expect(buildSource).toContain(
      'run("node", ["scripts/run-production-schema-effects.mjs"])',
    );
  });
});
