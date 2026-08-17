import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("production build environment gate", () => {
  it("runs the authoritative required-variable check before migrations and build", () => {
    const build = read("scripts/vercel-build.mjs");
    const validator = read("scripts/check-prod-env.mjs");

    expect(build).toContain("function validateProductionEnvironment()");
    expect(build).toContain("if (!isCanonicalProduction) return;");
    expect(build).toContain("CANONICAL_VERCEL_PROJECT_ID");
    expect(build).toContain('run("node", ["scripts/check-prod-env.mjs"])');

    const validationIndex = build.indexOf("validateProductionEnvironment();");
    const migrationIndex = build.indexOf("if (shouldMigrate)");
    const productBuildIndex = build.indexOf('run("npm", ["run", "build"])');

    expect(validationIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(migrationIndex);
    expect(validationIndex).toBeLessThan(productBuildIndex);

    expect(validator).toContain('"UPSTASH_REDIS_REST_URL"');
    expect(validator).toContain('"UPSTASH_REDIS_REST_TOKEN"');
  });

  it("keeps preview builds isolated from production-only credentials", () => {
    const build = read("scripts/vercel-build.mjs");

    expect(build).toContain("if (!isCanonicalProduction) return;");
    expect(build).toContain("configurePreviewEnvironment();\nvalidateProductionEnvironment();");
    expect(build).not.toContain("PRODUCTION_CHECK=1");
  });

  it("runs the fail-closed dependency audit in every canonical production certification", () => {
    const build = read("scripts/vercel-build.mjs");
    const audit = read("scripts/check-security-audit.mjs");
    const releaseAuditStart = build.indexOf("function runComprehensiveReleaseAudit()");
    const nextFunction = build.indexOf("function syncShowcaseIfRequested()", releaseAuditStart);
    const releaseAudit = build.slice(releaseAuditStart, nextFunction);

    expect(releaseAuditStart).toBeGreaterThan(-1);
    expect(releaseAudit).toContain('commitMessage.includes("[launch-deep-audit]")');
    expect(releaseAudit).toContain("if (!isCanonicalProduction && !explicitlyRequested) return;");
    expect(releaseAudit).toContain('run("npm", ["run", "security:audit"])');
    expect(releaseAudit).toContain('run("node", ["scripts/run-test-estate.mjs"])');
    expect(releaseAudit.indexOf('run("npm", ["run", "lint:eslint"])')).toBeLessThan(
      releaseAudit.indexOf('run("npm", ["run", "security:audit"])'),
    );
    expect(releaseAudit.indexOf('run("npm", ["run", "security:audit"])')).toBeLessThan(
      releaseAudit.indexOf('run("node", ["scripts/run-test-estate.mjs"])'),
    );

    expect(audit).toContain('execSync("npm audit --json --omit=dev"');
    expect(audit).toContain('!["high", "critical"].includes(vuln.severity)');
    expect(audit).toContain("Security audit gate FAILED");
    expect(audit).toContain("const ACCEPTED = []");
  });

  it("runs every Vitest process from an isolated OS-only environment", () => {
    const deploy = read("scripts/vercel-deploy.mjs");
    const build = read("scripts/vercel-build.mjs");
    const runner = read("scripts/run-test-estate.mjs");
    const environment = read("scripts/lib/test-estate-environment.mjs");
    const behavior = read("tests/test-estate-environment.test.ts");
    const liveVideoSettlement = read("src/lib/video-presenter/live-video-settlement.ts");

    expect(deploy).toContain(
      'run(process.execPath, [\n  "scripts/run-test-estate.mjs",\n  "tests/retired-client-env-sanitizer-contract.test.ts"',
    );
    expect(deploy).not.toContain(
      'run("npx", ["vitest", "run", "tests/retired-client-env-sanitizer-contract.test.ts"])',
    );
    expect(build).toContain('run("node", ["scripts/run-test-estate.mjs"])');
    expect(build).toContain(
      'run("node", [\n  "scripts/run-test-estate.mjs",\n  "tests/runtime-provider-chain-contract.test.ts"',
    );
    expect(build).not.toContain('run("npx", [\n  "vitest",\n  "run"');

    expect(runner).toContain('import { buildTestEstateEnvironment }');
    expect(runner).toContain("mkdtempSync");
    expect(runner).toContain('writeFileSync(env.NPM_CONFIG_USERCONFIG, ""');
    expect(runner).toContain('writeFileSync(env.GIT_CONFIG_GLOBAL, ""');
    expect(runner).toContain("rmSync(isolatedHome, { recursive: true, force: true })");
    expect(runner).toContain('resolve(process.cwd(), "node_modules/vitest/vitest.mjs")');
    expect(runner).not.toContain("const env = { ...source }");

    expect(environment).toContain("TEST_ESTATE_OS_PASSTHROUGH");
    expect(environment).toContain("const env = {};");
    expect(environment).toContain('env.NODE_ENV = "test"');
    expect(environment).toContain('env.VERCEL_ENV = "development"');
    expect(environment).toContain('env.WIRELINE_TEST_ESTATE_CLEAN_ROOM = "true"');
    expect(environment).not.toContain('env.VERCEL = "0"');
    expect(environment).not.toContain("SENTRY_DSN");
    expect(environment).not.toContain("VITE_SUPABASE_URL");

    expect(behavior).toContain("FUTURE_PROVIDER_CREDENTIAL");
    expect(behavior).toContain("FUTURE_DATABASE_URL");
    expect(behavior).toContain("expect(env.VERCEL).toBeUndefined()");
    expect(liveVideoSettlement).toContain('if (process.env.NODE_ENV === "test") return null;');
  });
});
