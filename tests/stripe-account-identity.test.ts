import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  effectiveStripeCardStatementDescriptor,
  stripeAccountIdentityFindings,
  stripeAccountIdentitySummary,
} from "../scripts/lib/stripe-account-identity.mjs";

describe("Stripe account identity guard", () => {
  it("accepts the canonical Wireline customer-facing identity", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Try Wireline",
        url: "https://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: "WIRELINE" },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#A78BFA",
          secondary_color: "#141319",
        },
      },
    });

    expect(findings).toEqual([]);
  });

  it("models Stripe's static-descriptor fallback when no card prefix is configured", () => {
    const account = {
      business_profile: {
        name: "Try Wireline",
        url: "https://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: null },
        payments: { statement_descriptor: "WIRELINE" },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#A78BFA",
          secondary_color: "#141319",
        },
      },
    };

    expect(effectiveStripeCardStatementDescriptor(account)).toEqual({
      value: "WIRELINE",
      source: "payment_statement_descriptor_fallback",
    });
    expect(stripeAccountIdentityFindings(account)).toEqual([]);
    expect(stripeAccountIdentitySummary(account)).toMatchObject({
      card_statement_descriptor_prefix: null,
      effective_card_statement_descriptor_prefix: "WIRELINE",
      card_statement_descriptor_prefix_source: "payment_statement_descriptor_fallback",
    });
  });

  it("truncates Stripe's fallback card prefix to ten characters", () => {
    const account = {
      settings: {
        card_payments: { statement_descriptor_prefix: null },
        payments: { statement_descriptor: "WIRELINE LONG NAME" },
      },
    };

    expect(effectiveStripeCardStatementDescriptor(account)).toEqual({
      value: "WIRELINE L",
      source: "payment_statement_descriptor_fallback",
    });
  });

  it("prefers an explicit card prefix over the static descriptor fallback", () => {
    const account = {
      settings: {
        card_payments: { statement_descriptor_prefix: "OTHER" },
        payments: { statement_descriptor: "WIRELINE" },
      },
    };

    expect(effectiveStripeCardStatementDescriptor(account)).toEqual({
      value: "OTHER",
      source: "explicit",
    });
  });

  it("fails on a stale company name, domain, and descriptors", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Cadence AI",
        url: "https://wireline-chi.vercel.app",
      },
      settings: {
        dashboard: { display_name: "Cadence AI" },
        card_payments: { statement_descriptor_prefix: "CADENCE AI" },
        payments: { statement_descriptor: "CADENCE AI" },
        branding: {
          logo: null,
          icon: null,
          primary_color: "#6D28D9",
          secondary_color: "#6D28D9",
        },
      },
    });

    expect(findings.filter((finding) => finding.level === "error")).toHaveLength(8);
    expect(findings.filter((finding) => finding.level === "warning")).toHaveLength(2);
    expect(findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/business profile name/i),
        expect.stringMatching(/canonical Wireline domain/i),
        expect.stringMatching(/card statement descriptor/i),
        expect.stringMatching(/payment statement descriptor/i),
        expect.stringMatching(/support URL/i),
        expect.stringMatching(/support email/i),
        expect.stringMatching(/no rectangular account logo/i),
        expect.stringMatching(/no square account icon/i),
        expect.stringMatching(/brand color/i),
        expect.stringMatching(/accent color/i),
      ]),
    );
  });

  it("allows the matching Try Wireline Dashboard label", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Try Wireline",
        url: "https://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Try Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: "WIRELINE" },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#A78BFA",
          secondary_color: "#141319",
        },
      },
    });

    expect(findings).toEqual([]);
  });

  it("rejects the product-only name for the public merchant profile", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Wireline",
        url: "https://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Try Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: "WIRELINE" },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#A78BFA",
          secondary_color: "#141319",
        },
      },
    });

    expect(findings).toEqual([
      expect.objectContaining({
        level: "error",
        metadata: expect.objectContaining({ expected: "Try Wireline", actual: "Wireline" }),
      }),
    ]);
  });

  it("accepts the www domain and a Wireline-prefixed dynamic descriptor", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: " try wireline ",
        url: "https://www.trywireline.com/pricing",
        support_url: "https://trywireline.com/support/",
        support_email: " SUPPORT@trywireline.com ",
      },
      settings: {
        dashboard: { display_name: "WIRELINE" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: "WIRELINE*RUNTIME" },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#a78bfa",
          secondary_color: "#141319",
        },
      },
    });

    expect(findings).toEqual([]);
  });

  it("rejects insecure canonical-domain URLs and descriptor lookalikes", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Try Wireline",
        url: "http://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINEFAKE" },
        payments: { statement_descriptor: "WIRELINEPAY" },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#A78BFA",
          secondary_color: "#141319",
        },
      },
    });

    expect(findings.filter((finding) => finding.level === "error")).toHaveLength(3);
    expect(findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/canonical Wireline domain/i),
        expect.stringMatching(/card statement descriptor/i),
        expect.stringMatching(/payment statement descriptor/i),
      ]),
    );
  });

  it("treats a missing general payment descriptor as identity drift", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Try Wireline",
        url: "https://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: null },
        branding: {
          logo: "file_logo",
          icon: "file_icon",
          primary_color: "#A78BFA",
          secondary_color: "#141319",
        },
      },
    });

    expect(findings).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringMatching(/payment statement descriptor/i),
      }),
    ]);
  });

  it("returns only sanitized customer-facing identity fields", () => {
    const summary = stripeAccountIdentitySummary({
      email: "private@example.com",
      individual: { first_name: "Private" },
      external_accounts: { data: [{ last4: "1234" }] },
      business_profile: { name: "Try Wireline", url: "not a URL" },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: null },
        branding: { logo: null, icon: "file_icon" },
      },
    });

    expect(summary).toEqual({
      business_profile_name: "Try Wireline",
      business_profile_host: null,
      business_profile_protocol: null,
      card_statement_descriptor_prefix: "WIRELINE",
      effective_card_statement_descriptor_prefix: "WIRELINE",
      card_statement_descriptor_prefix_source: "explicit",
      payment_statement_descriptor: null,
      branding_logo_configured: false,
      branding_icon_configured: true,
    });
    expect(JSON.stringify(summary)).not.toMatch(/private|1234/i);
  });

  it("makes the launch gate consume the exact merchant-identity constants", () => {
    const launchStatus = readFileSync(
      new URL("../scripts/generate-launch-status.mjs", import.meta.url),
      "utf8",
    );

    for (const constant of [
      "STRIPE_PUBLIC_BRAND",
      "STRIPE_PUBLIC_SUPPORT_URL",
      "STRIPE_PUBLIC_SUPPORT_EMAIL",
      "STRIPE_BRAND_PRIMARY_COLOR",
      "STRIPE_BRAND_SECONDARY_COLOR",
    ]) {
      expect(launchStatus).toContain(constant);
    }
    expect(launchStatus).toContain("supportUrl === STRIPE_PUBLIC_SUPPORT_URL");
    expect(launchStatus).toContain('statementDescriptor === "WIRELINE"');
    expect(launchStatus).toContain('cardStatementDescriptor === "WIRELINE"');
    expect(launchStatus).not.toContain("brandingIcon.length > 0 &&");
    expect(launchStatus).toContain("brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR");
    expect(launchStatus).toContain("brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR");
    expect(launchStatus).not.toContain("settings?.dashboard?.display_name");
    expect(launchStatus).not.toContain('statementDescriptor.startsWith("WIRELINE")');
  });
});
