import { describe, expect, it } from "vitest";

import {
  stripeAccountIdentityFindings,
  stripeAccountIdentitySummary,
} from "../scripts/lib/stripe-account-identity.mjs";

describe("Stripe account identity guard", () => {
  it("accepts the canonical Wireline customer-facing identity", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Wireline",
        url: "https://trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: "WIRELINE" },
        branding: { logo: "file_logo", icon: "file_icon" },
      },
    });

    expect(findings).toEqual([]);
  });

  it("fails on a stale company name, domain, dashboard name, and descriptors", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Cadence AI",
        url: "https://wireline-chi.vercel.app",
      },
      settings: {
        dashboard: { display_name: "Cadence AI" },
        card_payments: { statement_descriptor_prefix: "CADENCE AI" },
        payments: { statement_descriptor: "CADENCE AI" },
        branding: { logo: null, icon: null },
      },
    });

    expect(findings.filter((finding) => finding.level === "error")).toHaveLength(5);
    expect(findings.filter((finding) => finding.level === "warning")).toHaveLength(1);
    expect(findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/business profile name/i),
        expect.stringMatching(/canonical Wireline domain/i),
        expect.stringMatching(/dashboard display name/i),
        expect.stringMatching(/card statement descriptor/i),
        expect.stringMatching(/payment statement descriptor/i),
        expect.stringMatching(/no account logo or icon/i),
      ]),
    );
  });

  it("accepts the www domain and a Wireline-prefixed dynamic descriptor", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: " wireline ",
        url: "https://www.trywireline.com/pricing",
      },
      settings: {
        dashboard: { display_name: "WIRELINE" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: "WIRELINE*RUNTIME" },
        branding: { logo: "file_logo", icon: null },
      },
    });

    expect(findings).toEqual([]);
  });

  it("rejects insecure canonical-domain URLs and descriptor lookalikes", () => {
    const findings = stripeAccountIdentityFindings({
      business_profile: {
        name: "Wireline",
        url: "http://trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINEFAKE" },
        payments: { statement_descriptor: "WIRELINEPAY" },
        branding: { logo: "file_logo", icon: null },
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
        name: "Wireline",
        url: "https://trywireline.com",
      },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: null },
        branding: { logo: "file_logo", icon: null },
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
      business_profile: { name: "Wireline", url: "not a URL" },
      settings: {
        dashboard: { display_name: "Wireline" },
        card_payments: { statement_descriptor_prefix: "WIRELINE" },
        payments: { statement_descriptor: null },
        branding: { logo: null, icon: "file_icon" },
      },
    });

    expect(summary).toEqual({
      business_profile_name: "Wireline",
      business_profile_host: null,
      business_profile_protocol: null,
      dashboard_display_name: "Wireline",
      card_statement_descriptor_prefix: "WIRELINE",
      payment_statement_descriptor: null,
      branding_logo_configured: false,
      branding_icon_configured: true,
    });
    expect(JSON.stringify(summary)).not.toMatch(/private|1234/i);
  });
});
