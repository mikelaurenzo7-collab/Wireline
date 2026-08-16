import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  effectiveStripeCardStatementDescriptor,
  stripeAccountIdentityFindings,
  stripeAccountIdentitySummary,
} from "../scripts/lib/stripe-account-identity.mjs";
import { plansForClient } from "../src/lib/plan-catalog";

const RELEASE_ENV_KEYS = [
  "WIRELINE_SELF_SERVE_BILLING_ENABLED",
  "WIRELINE_LAUNCH_DEMO_MODE",
  "WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

function restoreEnvironment(previous: Map<string, string | undefined>) {
  for (const key of RELEASE_ENV_KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

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

  it("accepts Stripe's static descriptor fallback when no explicit card prefix exists", () => {
    const account = {
      business_profile: {
        name: "Try Wireline",
        url: "https://trywireline.com",
        support_url: "https://trywireline.com/support",
        support_email: "support@trywireline.com",
      },
      settings: {
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
  });

  it("models Stripe's ten-character fallback prefix without weakening brand matching", () => {
    expect(
      effectiveStripeCardStatementDescriptor({
        settings: {
          card_payments: { statement_descriptor_prefix: null },
          payments: { statement_descriptor: "WIRELINE*RUNTIME" },
        },
      }),
    ).toEqual({
      value: "WIRELINE*R",
      source: "payment_statement_descriptor_fallback",
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

  it("keeps paid plan CTAs closed until the exact deployed SHA is authorized", () => {
    const previous = new Map<string, string | undefined>(
      RELEASE_ENV_KEYS.map((key) => [key, process.env[key]]),
    );

    try {
      for (const key of RELEASE_ENV_KEYS) delete process.env[key];

      const closedCatalog = plansForClient();
      const free = closedCatalog.find((plan) => plan.id === "personal");
      const closedPaid = closedCatalog.filter((plan) => plan.price_usd_monthly > 0);
      expect(free).toMatchObject({ configured: true, annual_configured: true });
      expect(closedPaid).not.toHaveLength(0);
      expect(closedPaid.every((plan) => !plan.configured && !plan.annual_configured)).toBe(true);
      expect(closedPaid.every((plan) => plan.contact_sales)).toBe(true);

      const deployedSha = "a".repeat(40);
      process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
      process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";
      process.env.VERCEL_GIT_COMMIT_SHA = deployedSha;
      process.env.WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA = "b".repeat(40);
      expect(
        plansForClient()
          .filter((plan) => plan.price_usd_monthly > 0)
          .every((plan) => !plan.configured),
      ).toBe(true);

      process.env.WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA = deployedSha;
      const openPaid = plansForClient().filter((plan) => plan.price_usd_monthly > 0);
      expect(openPaid.every((plan) => plan.configured && plan.annual_configured)).toBe(true);
      expect(openPaid.every((plan) => plan.extra_agent_configured)).toBe(true);
      expect(openPaid.every((plan) => !plan.contact_sales)).toBe(true);
    } finally {
      restoreEnvironment(previous);
    }
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
    expect(launchStatus).toContain("effectiveStripeCardStatementDescriptor");
    expect(launchStatus).toContain("hasWirelineDescriptor(statementDescriptor)");
    expect(launchStatus).toContain("hasWirelineDescriptor(cardStatementDescriptor.value)");
    expect(launchStatus).toContain("card_statement_descriptor_source");
    expect(launchStatus).not.toContain('cardStatementDescriptor === "WIRELINE"');
    expect(launchStatus).not.toContain("brandingIcon.length > 0 &&");
    expect(launchStatus).toContain("brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR");
    expect(launchStatus).toContain("brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR");
    expect(launchStatus).not.toContain("settings?.dashboard?.display_name");
    expect(launchStatus).not.toContain('statementDescriptor.startsWith("WIRELINE")');
  });
});
