import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("double-pass residual hardening", () => {
  it("falls back to direct email on any support/contact service 5xx", () => {
    for (const path of ["src/components/SupportPage.tsx", "src/components/ContactPage.tsx"]) {
      const source = read(path);
      expect(source).toContain("responseStatus = response.status");
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@trywireline.com");
    }
  });

  it("repairs historical production Resend credentials without decrypting project secrets", () => {
    const source = read("scripts/sync-resend-env-to-vercel.mjs");
    expect(source).toContain("MANAGED_PRODUCTION_ONLY_KEYS");
    expect(source).toContain("narrowLegacyProductionEntries");
    expect(source).toContain('targets.some((target) => target !== "production")');
    expect(source).toContain("await patchEnv(entry.id, { target: PRODUCTION_TARGET })");
    expect(source).toContain('`/v10/projects/${encodeURIComponent(PROJECT_ID)}/env`');
    expect(source).not.toContain("decrypt=true");
    expect(source).not.toContain('["production", "preview", "development"]');
  });

  it("routes production schema certification through runtime-equivalent database selection", () => {
    const build = read("scripts/vercel-build.mjs");
    const wrapper = read("scripts/run-production-schema-effects.mjs");
    expect(build).toContain('run("node", ["scripts/run-production-schema-effects.mjs"])');
    expect(wrapper).toContain("resolveProductionSchemaDatabase");
    expect(wrapper).toContain("DATABASE_POOL_URL");
    expect(wrapper).toContain("POSTGRES_URL");
    expect(wrapper).toContain("delete childEnv.DATABASE_URL");
  });

  it("describes public status freshness without understating edge staleness", () => {
    const status = read("src/components/Status.tsx");
    expect(status).toContain("Normal cache · 120s");
    expect(status).toContain("Server fallback · up to 5m");
    expect(status).toContain("edge stale-while-revalidate");
    expect(status).toContain("timestamp above is the authoritative age");
  });
});
