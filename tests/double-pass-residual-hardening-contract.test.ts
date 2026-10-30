import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("double-pass residual hardening", () => {
  it("falls back to direct email on any support/contact service 5xx", () => {
    for (const path of ["src/components/SupportPage.tsx", "src/components/ContactPage.tsx"]) {
      const source = read(path);
      expect(source).toContain("responseStatus = response.status");
      expect(source).toContain("responseStatus !== null && responseStatus >= 500");
      expect(source).toContain("mailto:support@botbound.app");
      expect(source).not.toContain("support@trywireline.com");
    }
  });

  it("keeps every customer-facing support promise on the verified compatibility inbox", () => {
    for (const path of [
      "src/components/SupportPage.tsx",
      "src/components/ContactPage.tsx",
      "src/components/PrivacyPolicyPage.tsx",
      "src/components/LegalPage.tsx",
      "src/pages/Pricing.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("support@botbound.app");
      expect(source).not.toContain("support@trywireline.com");
    }
  });

  it("routes production schema certification through runtime-equivalent database selection", () => {
    const wrapper = read("scripts/run-production-schema-effects.mjs");
    expect(wrapper).toContain("resolveProductionSchemaDatabase");
    expect(wrapper).toContain("DATABASE_POOL_URL");
    expect(wrapper).toContain("POSTGRES_URL");
    expect(wrapper).toContain("delete childEnv.DATABASE_URL");
  });

  it("keeps service monitoring operational without a provider-branded customer page", () => {
    const app = read("src/App.tsx");
    const registration = read("src/server/register-api-routes.ts");
    expect(existsSync(resolve(process.cwd(), "src/components/Status.tsx"))).toBe(false);
    expect(app).not.toContain('path="/status"');
    expect(registration).toContain('app.all("/api/health/public"');
  });
});
