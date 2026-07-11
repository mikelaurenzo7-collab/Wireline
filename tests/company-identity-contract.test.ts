import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCompanyIdentityProfile,
  buildCompanyIdentityReadiness,
  canRequestCompanyIdentityReview,
  defaultCompanyIdentityPreferences,
} from "../src/lib/company-identity";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("company identity pack", () => {
  it("keeps provider approval separate from profile readiness", () => {
    const preferences = defaultCompanyIdentityPreferences();
    const profile = buildCompanyIdentityProfile({
      settings: {
        businessName: "Acme Services LLC",
        brandName: "Acme Services",
        brandLogoUrl: "https://example.com/logo.png",
      },
      preferences: {
        ...preferences,
        callerIdName: "ACME SERVICES",
        website: "https://example.com/",
        supportEmail: "support@example.com",
        defaultCallReason: "Appointment confirmation",
      },
    });
    const readiness = buildCompanyIdentityReadiness({
      profile,
      phoneNumber: "+13125550123",
    });

    expect(readiness.voice.profileStatus).toBe("ready");
    expect(readiness.sms.profileStatus).toBe("ready");
    expect(readiness.email.profileStatus).toBe("ready");
    expect(readiness.voice.providerStatus).toBe("not_requested");
    expect(readiness.voice.displayScope).toContain("supported mobile networks");
    expect(readiness.voice.displayScope).toContain("CNAM");
    expect(canRequestCompanyIdentityReview({ readiness, requestedChannels: ["voice"] })).toBe(
      true,
    );
  });

  it("requires the real channel prerequisites before review", () => {
    const preferences = defaultCompanyIdentityPreferences();
    const profile = buildCompanyIdentityProfile({ settings: null, preferences });
    const readiness = buildCompanyIdentityReadiness({ profile, phoneNumber: null });

    expect(readiness.voice.missing).toContain("dedicated Wireline number");
    expect(readiness.voice.missing).toContain("15-character caller ID fallback name");
    expect(readiness.sms.missing).toContain("support email");
    expect(readiness.email.missing).toContain("support email on the company domain");
    expect(
      canRequestCompanyIdentityReview({ readiness, requestedChannels: ["voice", "sms", "email"] }),
    ).toBe(false);
  });

  it("protects the authenticated review workflow and audit trail", () => {
    const routes = read("src/routes/company-identity-routes.ts");
    const registry = read("src/server/register-api-routes.ts");

    expect(routes).toContain('router.get(\n  "/api/company-identity"');
    expect(routes).toContain('router.post(\n  "/api/company-identity"');
    expect(routes).toContain('"/api/company-identity/review-request"');
    expect(routes.match(/authenticateUser/g)?.length).toBeGreaterThanOrEqual(3);
    expect(routes).toContain("company_identity.review_requested");
    expect(routes).toContain("approval and display coverage are not guaranteed");
    expect(routes).not.toContain('providerStatus[channel] = "approved"');
    expect(registry).toContain('import companyIdentityRouter from "../routes/company-identity-routes"');
    expect(registry).toContain("app.use(companyIdentityRouter)");
  });

  it("keeps the customer surface explicit about coverage and approval limits", () => {
    const surface = read("src/components/settings/CompanyIdentityPack.tsx");
    const phoneSettings = read("src/pages/PhoneSettings.tsx");

    expect(surface).toContain("Brand the employee, not just the dashboard.");
    expect(surface).toContain("Provider approval and recipient-device display remain external states.");
    expect(surface).toContain("Maximum 15 characters for traditional CNAM fallback.");
    expect(surface).toContain("supported mobile networks after approval");
    expect(surface).toContain("Request verification review");
    expect(phoneSettings).toContain("<CompanyIdentityPack />");
  });
});
