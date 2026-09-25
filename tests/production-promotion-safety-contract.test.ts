import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRODUCTION_URL,
  canonicalRuntimeCommitFinding,
  resolveCanonicalProductionUrl,
} from "../scripts/lib/production-url.mjs";
import { resolveVercelToken } from "../scripts/lib/vercel-project.mjs";

const promotionSource = readFileSync("scripts/promote-vercel-production.mjs", "utf8");
const redeploySource = readFileSync("scripts/redeploy-vercel-production.mjs", "utf8");
const waitSource = readFileSync("scripts/wait-vercel-deployment.mjs", "utf8");
const buildSource = readFileSync("scripts/vercel-build.mjs", "utf8");
const schemaPromotionSource = readFileSync("scripts/promote-production-schema.mjs", "utf8");
const providerPreflightSource = readFileSync("scripts/run-release-provider-preflight.mjs", "utf8");

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

  it("redeploys only an explicit exact-SHA production source", () => {
    expect(redeploySource).not.toContain("latestMainDeploymentId");
    expect(redeploySource).toContain("sourceDeploymentIdInput");
    expect(redeploySource).toContain("expectedCommitShaInput");
    expect(redeploySource).toContain("assertRedeploySource");
    expect(redeploySource).toContain("deploymentId: sourceDeploymentId");
    expect(redeploySource).toContain("redeploy_created_not_certified");

    const sourcePreflight = redeploySource.indexOf("assertRedeploySource(source");
    const redeployMutation = redeploySource.indexOf('vercelFetch("/v13/deployments"');
    expect(sourcePreflight).toBeGreaterThan(-1);
    expect(redeployMutation).toBeGreaterThan(sourcePreflight);
  });

  it("certifies the exact production target, canonical alias, and served source header", () => {
    expect(waitSource).toContain('mode !== "--production"');
    expect(waitSource).toContain("assertProductionDeploymentProvenance");
    expect(waitSource).toContain("assertReadyProductionDeployment");
    expect(waitSource).toContain("CANONICAL_PRODUCTION_URL");
    expect(waitSource).toContain("verifyRemoteSourceCommit");
    expect(waitSource).toContain("production_deployment_certified");
  });

  it("fails usage before any Vercel request when exact redeploy identity is absent", () => {
    for (const invocation of [
      ["scripts/redeploy-vercel-production.mjs"],
      ["scripts/wait-vercel-deployment.mjs", "dpl_candidate", "a".repeat(40)],
    ]) {
      const result = spawnSync(process.execPath, invocation, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          VERCEL_TOKEN: "",
          VERCEL_ACCESS_TOKEN: "",
          VERCEL_OIDC_TOKEN: "",
        },
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    }
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

  it("keeps production artifact compilation read-only and schema promotion exact-SHA", () => {
    expect(buildSource).toContain("CANONICAL_VERCEL_PROJECT_ID");
    expect(buildSource).toContain("isCanonicalVercelProject");
    expect(buildSource).toContain(
      "const shouldMigrate = !isCanonicalProduction && !migrationsDisabled && migrationsForced",
    );
    expect(buildSource).toContain("Canonical production artifact compilation is read-only");
    expect(buildSource).toContain("node scripts/promote-production-schema.mjs");
    expect(buildSource).not.toContain("release:promote-schema");
    expect(buildSource).toContain('run("node", ["scripts/run-production-schema-effects.mjs"])');
    expect(schemaPromotionSource).toContain("BOTBOUND_PRODUCTION_SCHEMA_CONFIRM");
    expect(schemaPromotionSource).toContain("BOTBOUND_RELEASE_SHA");
    expect(schemaPromotionSource).toContain("APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS");
    expect(schemaPromotionSource).toContain('"status", "--porcelain=v1"');
    expect(schemaPromotionSource).toContain('run("npm", ["run", "db:migrate"]');
    expect(schemaPromotionSource).toContain(
      'run("node", ["scripts/run-production-schema-effects.mjs"]',
    );
  });

  it("refuses to promote uncommitted schema under an otherwise valid release SHA", () => {
    const tempRepository = mkdtempSync(join(tmpdir(), "botbound-schema-promotion-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: tempRepository, stdio: "ignore" });
      writeFileSync(join(tempRepository, "tracked.txt"), "reviewed\n", "utf8");
      execFileSync("git", ["add", "tracked.txt"], { cwd: tempRepository, stdio: "ignore" });
      execFileSync(
        "git",
        [
          "-c",
          "user.name=BotBound Test",
          "-c",
          "user.email=botbound-test@example.invalid",
          "commit",
          "--quiet",
          "-m",
          "reviewed release",
        ],
        { cwd: tempRepository, stdio: "ignore" },
      );
      const releaseSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: tempRepository,
        encoding: "utf8",
      }).trim();
      writeFileSync(join(tempRepository, "uncommitted-migration.sql"), "select 1;\n", "utf8");

      const result = spawnSync(
        process.execPath,
        [resolve(process.cwd(), "scripts/promote-production-schema.mjs")],
        {
          cwd: tempRepository,
          env: {
            ...process.env,
            BOTBOUND_PRODUCTION_SCHEMA_CONFIRM: "APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS",
            BOTBOUND_RELEASE_SHA: releaseSha,
            POSTGRES_URL: "",
            DATABASE_URL: "",
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Local release checkout is not clean");
      expect(result.stderr).not.toContain("POSTGRES_URL or DATABASE_URL is required");
    } finally {
      rmSync(tempRepository, { recursive: true, force: true });
    }
  }, 15_000);

  it("certifies local artifacts without querying or mutating live providers", () => {
    const productBuild = buildSource.indexOf('run("npm", ["run", "build"]);');
    const serverSmoke = buildSource.indexOf('run("npm", ["run", "smoke:server"]);');
    const mcpBundle = buildSource.indexOf('"src/entrypoints/chatgpt-mcp-api.ts"');
    const nonproductionMigrations = buildSource.indexOf("if (shouldMigrate) {");

    expect(productBuild).toBeGreaterThan(-1);
    expect(serverSmoke).toBeGreaterThan(productBuild);
    expect(mcpBundle).toBeGreaterThan(serverSmoke);
    expect(nonproductionMigrations).toBeGreaterThan(mcpBundle);
    expect(buildSource).not.toContain("verifyStripePortalIfRequested");
    expect(buildSource).not.toContain("reconcile-stripe-customer-portal.mts");
    expect(providerPreflightSource).toContain('run("npm", ["run", "vendor:readiness"]');
    expect(providerPreflightSource).toContain('run("npm", ["run", "stripe:portal:verify"]');
    expect(providerPreflightSource).toContain('run("npm", ["run", "stripe:webhook:check"]');
    expect(providerPreflightSource).not.toContain("--apply");
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
    expect(resolveCanonicalProductionUrl("https://botbound.app/")).toBe(CANONICAL_PRODUCTION_URL);
    expect(() => resolveCanonicalProductionUrl("https://healthy-copy.example.com")).toThrow(
      /noncanonical production origin/,
    );
    expect(() => resolveCanonicalProductionUrl("https://botbound.app/alternate")).toThrow(
      /noncanonical production origin/,
    );
    expect(() => resolveCanonicalProductionUrl("https://trywireline.com/")).toThrow(
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
