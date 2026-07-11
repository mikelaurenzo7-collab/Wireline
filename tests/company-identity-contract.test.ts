import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCompanyIdentityProfile,
  buildCompanyIdentityReadiness,
  canRequestCompanyIdentityReview,
  companyIdentityFingerprint,
  defaultCompanyIdentityPreferences,
  readCompanyIdentityPreferences,
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

  it("fails closed instead of broadening an empty or corrupt channel selection", () => {
    const empty = readCompanyIdentityPreferences({ requestedChannels: [] });
    const corrupt = readCompanyIdentityPreferences({ requestedChannels: ["unsupported"] });

    expect(empty.requestedChannels).toEqual([]);
    expect(corrupt.requestedChannels).toEqual([]);
  });

  it("requires the email identity to use the company website domain", () => {
    const profile = buildCompanyIdentityProfile({
      settings: { businessName: "Acme", brandName: "Acme", brandLogoUrl: null },
      preferences: {
        ...defaultCompanyIdentityPreferences(),
        website: "https://www.example.com/",
        supportEmail: "acme@gmail.com",
      },
    });
    const readiness = buildCompanyIdentityReadiness({ profile, phoneNumber: "+13125550123" });

    expect(readiness.sms.profileStatus).toBe("ready");
    expect(readiness.email.profileStatus).toBe("incomplete");
    expect(readiness.email.missing).toContain("support email on the company domain");
  });

  it("binds review state to a privacy-minimized digest of the identity and number", () => {
    const base = {
      businessName: "Acme LLC",
      brandName: "Acme",
      logoUrl: "https://example.com/logo.png",
      callerIdName: "ACME",
      website: "https://example.com/",
      supportEmail: "support@example.com",
      defaultCallReason: "Scheduling",
      phoneNumber: "+13125550123",
    };
    const first = companyIdentityFingerprint(base);
    const renamed = companyIdentityFingerprint({
      ...base,
      brandName: "Acme Home Services",
    });
    const renumbered = companyIdentityFingerprint({
      ...base,
      phoneNumber: "+13125550999",
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(base.supportEmail);
    expect(first).not.toContain(base.phoneNumber);
    expect(first).not.toBe(renamed);
    expect(first).not.toBe(renumbered);
  });

  it("protects and serializes the authenticated review workflow", () => {
    const routes = read("src/routes/company-identity-routes.ts");
    const identity = read("src/lib/company-identity.ts");
    const guard = read("src/routes/user-preference-guard-routes.ts");
    const registry = read("src/server/register-api-routes.ts");

    expect(routes).toContain('router.get(\n  "/api/company-identity"');
    expect(routes).toContain('router.post(\n  "/api/company-identity"');
    expect(routes).toContain('"/api/company-identity/review-request"');
    expect(routes.match(/authenticateUser/g)?.length).toBeGreaterThanOrEqual(3);
    expect(routes).toContain("company_identity.review_requested");
    expect(routes).toContain("company_identity.review_invalidated");
    expect(routes).toContain("reviewFingerprint: current.currentFingerprint");
    expect(routes).toContain("already_requested: true");
    expect(routes).toContain("IDENTITY_REVIEW_REQUIRES_CHANGES");
    expect(routes).toContain('if (providerStatus[channel] === "not_requested")');
    expect(routes).toContain('throw AppError.fromHttpStatus(400, "Select at least one identity channel.")');
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain("wireline_settings WHERE user_id");
    expect(routes).toContain("wireline_user_preferences WHERE user_id");
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain("profileFingerprintSha256: current.currentFingerprint");
    expect(routes).not.toContain("profileFingerprint: current.currentFingerprint");
    expect(routes).toContain("phoneNumber: current.phoneNumber");
    expect(routes).toContain("desc(schema.phoneNumbers.id)");
    expect(routes).toContain("channelSelectionChanged");
    expect(identity).toContain('createHash("sha256")');
    expect(identity).toContain("must fail closed");
    expect(identity).toContain("Requested channel selection is deliberately excluded");
    expect(routes).toContain("final display follow supported Wireline workflows");
    expect(routes).not.toContain('providerStatus[channel] = "approved"');

    expect(guard).toContain("Canonical preference writer");
    expect(guard).toContain("pg_advisory_xact_lock");
    expect(guard).toContain("FOR UPDATE");
    expect(guard).toContain("requestedEnvelope.company_identity = currentEnvelope.company_identity");
    expect(guard).toContain("delete requestedEnvelope.company_identity");
    expect(registry).toContain(
      'import userPreferenceGuardRouter from "../routes/user-preference-guard-routes"',
    );
    expect(registry).toContain("app.use(userPreferenceGuardRouter)");
    expect(registry).toContain('import companyIdentityRouter from "../routes/company-identity-routes"');
    expect(registry).toContain("app.use(companyIdentityRouter)");
  });

  it("reconciles generic branding and every tenant-number mutation", () => {
    const mutation = read("src/lib/company-identity-mutation.ts");
    const settingsGuard = read("src/routes/company-identity-settings-guard-routes.ts");
    const carrier = read("src/routes/carrier-routes.ts");
    const provisioning = read("src/lib/phone-provisioning.ts");
    const registry = read("src/server/register-api-routes.ts");

    expect(mutation).toContain("acquireCompanyIdentityMutationLock");
    expect(mutation).toContain("reconcileCompanyIdentityAfterMutation");
    expect(mutation).toContain("pg_advisory_xact_lock");
    expect(mutation).toContain("company_identity.review_invalidated");
    expect(mutation).toContain('reason: "branding_changed" | "phone_number_changed"');

    expect(settingsGuard).toContain("IDENTITY_SETTING_KEYS");
    expect(settingsGuard).toContain('"business_name"');
    expect(settingsGuard).toContain('"businessName"');
    expect(settingsGuard).toContain('"brand_logo_url"');
    expect(settingsGuard).toContain('"brandLogoUrl"');
    expect(settingsGuard).toContain("router.use(");
    expect(settingsGuard).not.toContain("router.post(");
    expect(settingsGuard).toContain('req.method !== "POST"');
    expect(settingsGuard).toContain('runCompanyIdentityMutation(req.user.id, "branding_changed"');
    expect(settingsGuard).toContain("delete downstreamBody[key]");
    expect(registry).toContain(
      'import companyIdentitySettingsGuardRouter from "../routes/company-identity-settings-guard-routes"',
    );
    expect(registry).toContain("app.use(companyIdentitySettingsGuardRouter)");

    expect(carrier.match(/runCompanyIdentityMutation\(req\.user\.id, "phone_number_changed"/g))
      .toHaveLength(3);
    expect(carrier).toContain("desc(schema.phoneNumbers.id)");
    expect(provisioning).toContain('runCompanyIdentityMutation(userId, "phone_number_changed"');
    expect(provisioning).toContain("compensateProvisionedNumber");
    expect(provisioning).toContain("Provider number released after local persistence failure");
    expect(provisioning).toContain(
      "Number provisioning could not be saved; the provider allocation was released.",
    );
  });

  it("keeps the customer surface explicit, fail-closed, and touch accessible", () => {
    const surface = read("src/components/settings/CompanyIdentityPack.tsx");
    const phoneSettings = read("src/pages/PhoneSettings.tsx");

    expect(surface).toContain("Brand the employee, not just the dashboard.");
    expect(surface).toContain("Provider approval and recipient-device display remain external states.");
    expect(surface).toContain("Maximum 15 characters for traditional CNAM fallback.");
    expect(surface).toContain("supported mobile networks after approval");
    expect(surface).toContain("Save these changes before requesting verification review.");
    expect(surface).toContain("Select at least one identity channel before saving.");
    expect(surface).toContain("min-h-11 cursor-pointer");
    expect(surface).toContain("reviewAlreadyRequested");
    expect(surface).toContain("Review already requested");
    expect(surface).toContain("Update identity to resubmit");
    expect(surface).toContain("Not selected");
    expect(surface).toContain("Request verification review");
    expect(phoneSettings).toContain('key={activeNumber?.id ?? "no-number"}');
  });
});
