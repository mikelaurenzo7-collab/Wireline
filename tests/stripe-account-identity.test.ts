import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  effectiveStripeCardStatementDescriptor,
  stripeAccountIdentityFindings,
  stripeAccountIdentitySummary,
} from "../scripts/lib/stripe-account-identity.mjs";
import { plansForClient, STRIPE_PLANS } from "../src/lib/plan-catalog";

const RELEASE_ENV_KEYS = [
  "WIRELINE_SELF_SERVE_BILLING_ENABLED",
  "WIRELINE_LAUNCH_DEMO_MODE",
  "WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_SHA",
  ...STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels").flatMap((plan) => [
    plan.priceIdEnv!,
    plan.annualPriceIdEnv!,
  ]),
] as const;

function restoreEnvironment(previous: Map<string, string | undefined>) {
  for (const key of RELEASE_ENV_KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function canonicalAccount(overrides: Record<string, unknown> = {}) {
  return {
    business_profile: {
      name: "BotBound",
      url: "https://botbound.app",
      support_url: "https://botbound.app/support",
      support_email: "support@botbound.app",
    },
    settings: {
      dashboard: { display_name: "BotBound" },
      card_payments: { statement_descriptor_prefix: "BOTBOUND" },
      payments: { statement_descriptor: "BOTBOUND" },
      branding: {
        logo: "file_logo",
        icon: "file_icon",
        primary_color: "#A78BFA",
        secondary_color: "#141319",
      },
    },
    ...overrides,
  };
}

describe("Stripe account identity guard", () => {
  it("accepts the canonical BotBound customer-facing identity", () => {
    expect(stripeAccountIdentityFindings(canonicalAccount())).toEqual([]);
  });

  it("accepts Stripe's static descriptor fallback when no explicit card prefix exists", () => {
    const account = canonicalAccount();
    account.settings.card_payments.statement_descriptor_prefix = null as unknown as string;
    expect(effectiveStripeCardStatementDescriptor(account)).toEqual({
      value: "BOTBOUND",
      source: "payment_statement_descriptor_fallback",
    });
    expect(stripeAccountIdentityFindings(account)).toEqual([]);
  });

  it("models Stripe's ten-character fallback prefix without weakening brand matching", () => {
    expect(
      effectiveStripeCardStatementDescriptor({
        settings: {
          card_payments: { statement_descriptor_prefix: null },
          payments: { statement_descriptor: "BOTBOUND*RUNTIME" },
        },
      }),
    ).toEqual({
      value: "BOTBOUND*R",
      source: "payment_statement_descriptor_fallback",
    });
  });

  it("fails on a stale company name, domain, descriptors, and missing hosted branding", () => {
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
        expect.stringMatching(/canonical BotBound domain/i),
        expect.stringMatching(/card statement descriptor/i),
        expect.stringMatching(/payment statement descriptor/i),
        expect.stringMatching(/support URL/i),
        expect.stringMatching(/support email/i),
        expect.stringMatching(/logo/i),
        expect.stringMatching(/icon/i),
        expect.stringMatching(/brand color/i),
        expect.stringMatching(/accent color/i),
      ]),
    );
  });

  it("accepts the www domain and a BotBound-prefixed dynamic descriptor", () => {
    const account = canonicalAccount();
    account.business_profile.name = " botbound ";
    account.business_profile.url = "https://www.botbound.app/pricing";
    account.business_profile.support_email = " SUPPORT@botbound.app ";
    account.settings.card_payments.statement_descriptor_prefix = "BOTBOUND";
    account.settings.payments.statement_descriptor = "BOTBOUND*RUNTIME";
    account.settings.branding.primary_color = "#a78bfa";
    expect(stripeAccountIdentityFindings(account)).toEqual([]);
  });

  it("rejects insecure canonical-domain URLs and descriptor lookalikes", () => {
    const account = canonicalAccount();
    account.business_profile.url = "http://botbound.app";
    account.settings.card_payments.statement_descriptor_prefix = "BOTBOUNDFAKE";
    account.settings.payments.statement_descriptor = "BOTBOUNDPAY";
    const findings = stripeAccountIdentityFindings(account);
    expect(findings.filter((finding) => finding.level === "error")).toHaveLength(3);
  });

  it("treats a missing general payment descriptor as identity drift", () => {
    const account = canonicalAccount();
    account.settings.payments.statement_descriptor = null as unknown as string;
    expect(stripeAccountIdentityFindings(account)).toEqual([
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
      business_profile: { name: "BotBound", url: "not a URL" },
      settings: {
        dashboard: { display_name: "BotBound" },
        card_payments: { statement_descriptor_prefix: "BOTBOUND" },
        payments: { statement_descriptor: null },
        branding: { logo: null, icon: "file_icon" },
      },
    });

    expect(summary).toEqual({
      business_profile_name: "BotBound",
      business_profile_host: null,
      business_profile_protocol: null,
      card_statement_descriptor_prefix: "BOTBOUND",
      effective_card_statement_descriptor_prefix: "BOTBOUND",
      card_statement_descriptor_prefix_source: "explicit",
      payment_statement_descriptor: null,
      branding_logo_configured: false,
      branding_icon_configured: true,
    });
    expect(JSON.stringify(summary)).not.toMatch(/private|1234/i);
  });

  it("keeps paid plan CTAs closed outside the audited production main channel", () => {
    const previous = new Map<string, string | undefined>(
      RELEASE_ENV_KEYS.map((key) => [key, process.env[key]]),
    );

    try {
      for (const key of RELEASE_ENV_KEYS) delete process.env[key];
      process.env.WIRELINE_SELF_SERVE_BILLING_ENABLED = "true";
      process.env.WIRELINE_LAUNCH_DEMO_MODE = "false";
      for (const plan of STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels")) {
        process.env[plan.priceIdEnv!] = "price_fixture";
        process.env[plan.annualPriceIdEnv!] = "price_fixture_annual";
      }

      const closedPaid = plansForClient().filter((plan) => plan.price_usd_monthly > 0);
      expect(closedPaid.every((plan) => !plan.configured && !plan.annual_configured)).toBe(true);
      expect(closedPaid.every((plan) => plan.contact_sales)).toBe(true);

      process.env.VERCEL_ENV = "production";
      process.env.VERCEL_GIT_COMMIT_REF = "feature/not-main";
      expect(
        plansForClient()
          .filter((plan) => plan.price_usd_monthly > 0)
          .every((plan) => !plan.configured),
      ).toBe(true);

      process.env.VERCEL_GIT_COMMIT_REF = "main";
      // The retired exact-SHA variable must not be required for every safe redeploy.
      delete process.env.WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA;
      process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
      const openPaid = plansForClient().filter(
        (plan) => plan.price_usd_monthly > 0 && plan.checkout_availability === "available",
      );
      expect(openPaid).toHaveLength(10);
      expect(openPaid.every((plan) => plan.configured && plan.annual_configured)).toBe(true);
      expect(openPaid.every((plan) => !plan.extra_agent_configured)).toBe(true);
      expect(openPaid.every((plan) => !plan.contact_sales)).toBe(true);
      expect(
        plansForClient()
          .filter((plan) => plan.channels.includes("sms"))
          .every((plan) => !plan.configured && !plan.annual_configured),
      ).toBe(true);
    } finally {
      restoreEnvironment(previous);
    }
  });

  it("makes the launch gate consume the canonical merchant-identity constants", () => {
    const launchStatus = readFileSync(
      new URL("../scripts/lib/stripe-launch-readiness.mjs", import.meta.url),
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
    // Compatibility helper name remains imported while matching BotBound descriptors.
    expect(launchStatus).toContain("hasWirelineDescriptor(statementDescriptor)");
    expect(launchStatus).toContain("hasWirelineDescriptor(cardStatementDescriptor.value)");
    expect(launchStatus).toContain("card_statement_descriptor_source");
    expect(launchStatus).not.toContain('cardStatementDescriptor === "WIRELINE"');
    expect(launchStatus).not.toContain("brandingIcon.length > 0 &&");
    expect(launchStatus).toContain("brandingPrimaryColor === STRIPE_BRAND_PRIMARY_COLOR");
    expect(launchStatus).toContain("brandingSecondaryColor === STRIPE_BRAND_SECONDARY_COLOR");
    expect(launchStatus).not.toContain("settings?.dashboard?.display_name");
  });
});
