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
    expect(providerPreflight).toContain("WIRELINE_RECONCILE_STRIPE_PORTAL");
    expect(providerPreflight).toContain("read-only portal verification");
    expect(providerPreflight).toContain('run("npm", ["run", "stripe:portal:verify"]');
    expect(providerPreflight).toContain('run("npm", ["run", "stripe:webhook:check"]');
    expect(providerPreflight).not.toContain("--apply");
  });

  it("requires database-owned PSTN routing and removes retired founder monitoring", () => {
    expect(read("src/lib/founder-showcase-seed.ts")).not.toContain(
      "public_phone_number: agent.tel",
    );
    expect(read("src/data/contact-agents.ts")).toContain(
      "export const ALL_SHOWCASE_CONTACT_AGENTS: ReadonlyArray<ContactAgent> = [];",
    );
    expect(existsSync(resolve(root, "src/lib/demo-line-canary.ts"))).toBe(false);
  });

  it("counts every native OpenAI SIP failure class as a pipeline failure", () => {
    const failures = ["openai_response", "openai_realtime", "startup", "heartbeat"] as const;
    const capture = read("src/lib/call-reliability-capture.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    const failureSet = capture.slice(
      capture.indexOf("const PIPELINE_FAILURE_VALUES"),
      capture.indexOf("export function isPipelineFailure"),
    );

    for (const failure of failures) {
      expect(failureSet).toContain(`"${failure}"`);
      expect(session).toContain(failure);
    }
  });

  it("uses the verified BotBound sender throughout the runtime and sync tooling", () => {
    expect(read("src/lib/resend-config.ts")).toContain('const DEFAULT_DOMAIN = "botbound.me"');
    const sync = read("scripts/sync-resend-env-to-vercel.mjs");
    expect(sync).toContain('RESEND_FROM_EMAIL = "BotBound <noreply@botbound.me>"');
    expect(sync).toContain('const RETIRED_SENDER_DOMAIN = "trywireline.com"');
    expect(sync).toContain("Refusing ${key}");
    expect(sync).not.toContain("noreply@trywireline.com");
  });

  it("does not publish synthetic customer-activity metrics", () => {
    const marketing = read("src/routes/marketing-runtime-routes.ts");
    expect(marketing).not.toContain("agents_online: 120");
    expect(marketing).not.toContain("calls_this_month: 8400");
    expect(marketing).not.toContain("tenants: 95");
    expect(marketing).toContain('reason: "customer_activity_metrics_not_yet_published"');
  });
});
