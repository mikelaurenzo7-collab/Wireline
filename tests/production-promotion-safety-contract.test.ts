import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRODUCTION_URL,
  canonicalRuntimeCommitFinding,
  resolveCanonicalProductionUrl,
} from "../scripts/lib/production-url.mjs";
import { resolveVercelToken } from "../scripts/lib/vercel-project.mjs";

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
    const projectAuthority = readFileSync("scripts/lib/vercel-project.mjs", "utf8");
    expect(projectAuthority).toContain("CANONICAL_TEAM_ID");
    expect(projectAuthority).toContain("CANONICAL_PROJECT_ID");
    expect(projectAuthority).not.toContain("process.env.VERCEL_PROJECT_ID?.trim()");
    expect(promotionSource).toContain("projectId !== PROJECT_ID");
    expect(promotionSource).toContain('state !== "READY"');
    expect(promotionSource).toContain('commitRef !== "main"');
    expect(promotionSource).toContain("WIRELINE_EXPECTED_COMMIT_SHA");
    expect(promotionSource).toContain("/^[0-9a-f]{40}$/i");
    expect(promotionSource).toContain(
      "commitSha.toLowerCase() !== expectedCommitSha.toLowerCase()",
    );
  });

  it("uses the documented Vercel token without alias drift", () => {
    expect(
      resolveVercelToken({
        VERCEL_TOKEN: " documented ",
        VERCEL_ACCESS_TOKEN: "legacy",
        VERCEL_OIDC_TOKEN: "oidc",
      }),
    ).toBe("documented");
    expect(resolveVercelToken({ VERCEL_ACCESS_TOKEN: " access " })).toBe("access");
    expect(resolveVercelToken({ VERCEL_OIDC_TOKEN: " oidc " })).toBe("oidc");
  });

  it("cannot disable exact-head migrations on the canonical production build", () => {
    expect(buildSource).toContain("CANONICAL_VERCEL_PROJECT_ID");
    expect(buildSource).toContain("isCanonicalVercelProject");
    expect(buildSource).toContain("if (isCanonicalProduction && migrationsDisabled)");
    expect(buildSource).toContain(
      "Refusing canonical production build with WIRELINE_RUN_MIGRATIONS=false",
    );
    expect(buildSource).toContain('run("npm", ["run", "db:migrate"])');
    expect(buildSource).toContain('run("node", ["scripts/run-production-schema-effects.mjs"])');
  });

  it("rejects every noncanonical production project, including v0-named copies", () => {
    const result = spawnSync(process.execPath, ["scripts/vercel-build.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: "prj_not_wireline",
        VERCEL_URL: "v0-project-copy.vercel.app",
      },
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unrecognized Vercel project");
    expect(result.stderr).toContain("project-name heuristics are not an isolation boundary");
  });

  it("probes readiness only on the canonical customer-facing origin", () => {
    expect(resolveCanonicalProductionUrl("")).toBe(CANONICAL_PRODUCTION_URL);
    expect(resolveCanonicalProductionUrl("https://trywireline.com/")).toBe(
      CANONICAL_PRODUCTION_URL,
    );
    expect(() => resolveCanonicalProductionUrl("https://healthy-copy.example.com")).toThrow(
      /noncanonical production origin/,
    );
    expect(() => resolveCanonicalProductionUrl("https://trywireline.com/alternate")).toThrow(
      /noncanonical production origin/,
    );
  });

  it("fails an alias split-brain even when another deployment is healthy", () => {
    expect(
      canonicalRuntimeCommitFinding({ ok: true, sourceCommit: "a".repeat(40) }, "a".repeat(40)),
    ).toBeNull();
    expect(
      canonicalRuntimeCommitFinding({ ok: true, sourceCommit: "b".repeat(40) }, "a".repeat(40)),
    ).toBe("canonical_domain_commit_mismatch");
    expect(canonicalRuntimeCommitFinding({ ok: false }, "a".repeat(40))).toBe(
      "canonical_runtime_unreachable",
    );
  });
});
