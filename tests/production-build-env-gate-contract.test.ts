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
    expect(build).toContain('environment !== "production" || isDuplicateV0Project');
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

    expect(build).toContain('if (environment !== "production" || isDuplicateV0Project) return;');
    expect(build).toContain("configurePreviewEnvironment();\nvalidateProductionEnvironment();");
    expect(build).not.toContain("PRODUCTION_CHECK=1");
  });

  it("runs the fail-closed production dependency audit in every deep launch certification", () => {
    const build = read("scripts/vercel-build.mjs");
    const audit = read("scripts/check-security-audit.mjs");
    const deepAuditStart = build.indexOf("function runDeepLaunchAuditIfRequested()");
    const nextFunction = build.indexOf("function syncShowcaseIfRequested()", deepAuditStart);
    const deepAudit = build.slice(deepAuditStart, nextFunction);

    expect(deepAuditStart).toBeGreaterThan(-1);
    expect(deepAudit).toContain('commitMessage.includes("[launch-deep-audit]")');
    expect(deepAudit).toContain('run("npm", ["run", "security:audit"])');
    expect(deepAudit.indexOf('run("npm", ["run", "lint:eslint"])')).toBeLessThan(
      deepAudit.indexOf('run("npm", ["run", "security:audit"])'),
    );
    expect(deepAudit.indexOf('run("npm", ["run", "security:audit"])')).toBeLessThan(
      deepAudit.indexOf('run("npm", ["run", "test:run"])'),
    );

    expect(audit).toContain('execSync("npm audit --json --omit=dev"');
    expect(audit).toContain('!["high", "critical"].includes(vuln.severity)');
    expect(audit).toContain("Security audit gate FAILED");
    expect(audit).toContain("const ACCEPTED = []");
  });
});