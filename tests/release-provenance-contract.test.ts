import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BotBound release provenance", () => {
  it("builds the reviewed source tree without a deploy-time brand rewrite", () => {
    const deploy = read("scripts/vercel-deploy.mjs");
    expect(existsSync(resolve(root, "scripts/apply-botbound-customer-literal-migration.mjs"))).toBe(
      false,
    );
    expect(deploy).not.toContain("apply-botbound-customer-literal-migration");
    expect(deploy).toContain("The reviewed source tree is the artifact");
  });

  it("keeps production artifact compilation read-only across database and provider state", () => {
    const build = read("scripts/vercel-build.mjs");
    const schemaPromotion = read("scripts/promote-production-schema.mjs");
    const providerPreflight = read("scripts/run-release-provider-preflight.mjs");

    expect(build).toContain(
      "const shouldMigrate = !isCanonicalProduction && !migrationsDisabled && migrationsForced",
    );
    expect(build).not.toContain("verifyStripePortalIfRequested");
    expect(build).not.toContain("reconcile-stripe-customer-portal.mts");
    expect(schemaPromotion).toContain("APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS");
    expect(schemaPromotion).toContain("BOTBOUND_RELEASE_SHA");
    expect(schemaPromotion).toContain('run("npm", ["run", "db:migrate"]');
    expect(schemaPromotion).toContain('run("node", ["scripts/run-production-schema-effects.mjs"]');
    expect(providerPreflight).toContain('run("npm", ["run", "stripe:portal:verify"]');
    expect(providerPreflight).toContain('run("npm", ["run", "stripe:webhook:check"]');
    expect(providerPreflight).not.toContain("--apply");
  });

  it("keeps retired founder PSTN metadata out of Bot profiles and monitoring disabled by default", () => {
    expect(read("src/lib/founder-showcase-seed.ts")).not.toContain(
      "public_phone_number: agent.tel",
    );
    const canary = read("src/lib/demo-line-canary.ts");
    expect(canary).toContain("BOTBOUND_ENABLE_FOUNDER_PSTN_CANARY");
    expect(canary).toContain('result.skipReason = "founder_pstn_retired"');
    expect(canary.indexOf("if (!founderPstnCanaryEnabled())")).toBeLessThan(
      canary.indexOf("const client = getTwilioClient()"),
    );
  });

  it("uses the BotBound sender fallback and does not publish synthetic traction metrics", () => {
    expect(read("src/lib/resend-config.ts")).toContain('const DEFAULT_DOMAIN = "botbound.me"');
    const marketing = read("src/routes/marketing-runtime-routes.ts");
    expect(marketing).not.toContain("agents_online: 120");
    expect(marketing).not.toContain("calls_this_month: 8400");
    expect(marketing).not.toContain("tenants: 95");
    expect(marketing).toContain('reason: "customer_activity_metrics_not_yet_published"');
  });
});
