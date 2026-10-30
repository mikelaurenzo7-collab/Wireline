import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("production build environment gate", () => {
  it("requires the authoritative production-variable check", () => {
    const validator = read("scripts/check-prod-env.mjs");

    expect(validator).toContain('"UPSTASH_REDIS_REST_URL"');
    expect(validator).toContain('"UPSTASH_REDIS_REST_TOKEN"');
    expect(validator).toContain('"AGENTMAIL_API_KEY"');
    expect(validator).toContain('"AGENTMAIL_DEFAULT_DOMAIN"');
    expect(validator).toContain('"TWILIO_WEBHOOK_BASE_URL"');
    expect(validator).toContain('"WIRELINE_RECONCILE_STRIPE_PORTAL"');
  });

  it("runs the fail-closed dependency audit in every canonical production certification", () => {
    const audit = read("scripts/check-security-audit.mjs");
    const bulkAudit = read("scripts/lib/npm-bulk-audit.mjs");
    const osvAudit = read("scripts/lib/osv-audit.mjs");
    const osvBehavior = read("tests/security-audit-osv-fallback.test.mjs");
    const runner = read("scripts/run-test-estate.mjs");
    expect(audit).toContain("buildProductionPackagePayload");
    expect(audit).toContain("requestBulkAdvisories");
    expect(audit).toContain("requestOsvAdvisories");
    expect(audit).toContain("attempts: 1");
    expect(audit).toContain("timeoutMs: 60_000");
    expect(audit).toContain('auditSource = "OSV.dev"');
    expect(audit).not.toContain("npm audit --json");
    expect(bulkAudit).toContain('const BULK_AUDIT_PATH = "-/npm/v1/security/advisories/bulk"');
    expect(bulkAudit).toContain("gunzipSync");
    expect(bulkAudit).toContain("entry.dev === true");
    expect(bulkAudit).toContain(
      'const BLOCKING_SEVERITIES = new Set(["high", "critical"])',
    );
    expect(osvAudit).toContain(
      'const DEFAULT_QUERY_ENDPOINT = "https://api.osv.dev/v1/querybatch"',
    );
    expect(osvAudit).toContain(
      'const DEFAULT_VULNERABILITY_ENDPOINT = "https://api.osv.dev/v1/vulns/"',
    );
    expect(osvAudit).toContain("next_page_token");
    expect(osvAudit).toContain('method: "GET"');
    expect(osvAudit).toContain("did not provide a recognized severity");
    expect(osvBehavior).toContain("follows per-query pagination");
    expect(osvBehavior).toContain("returns a clean report when every queried version");
    expect(runner).toContain('"tests/security-audit-osv-fallback.test.mjs"');
    expect(audit).toContain("Security audit gate FAILED");
    expect(audit).toContain("const ACCEPTED = []");
  });

  it("runs every Vitest process from an isolated OS-only environment", () => {
    const runner = read("scripts/run-test-estate.mjs");
    const environment = read("scripts/lib/test-estate-environment.mjs");
    const behavior = read("tests/test-estate-environment.test.ts");
    const liveVideoSettlement = read("src/lib/video-presenter/live-video-settlement.ts");

    expect(runner).toContain("import { buildTestEstateEnvironment }");
    expect(runner).toContain("mkdtempSync");
    expect(runner).toContain('writeFileSync(env.NPM_CONFIG_USERCONFIG, ""');
    expect(runner).toContain('writeFileSync(env.GIT_CONFIG_GLOBAL, ""');
    expect(runner).toContain("rmSync(isolatedHome, { recursive: true, force: true })");
    expect(runner).toContain('resolve(process.cwd(), "node_modules/vitest/vitest.mjs")');
    expect(runner).toContain('extraArgs[0] === "--canonical-release-second-pass"');
    expect(runner).not.toContain("releaseAuditNoArgs");
    expect(runner).not.toContain("extraArgs.length === 0 && (productionTarget");
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
