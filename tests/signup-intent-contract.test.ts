import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIGNUP_PLAN_IDS,
  PUBLIC_SIGNUP_PLAN_SLUGS,
  activationBillingHref,
  mergeSignupIntent,
  parseSignupIntent,
  recommendedPlanFromIntent,
  SIGNUP_WEDGE_KEYS,
  sanitizeSignupIntent,
  signupHrefForPlan,
  signupHrefForWedge,
  signupTemplateLabel,
} from "../src/lib/signup-intent";
import { signupSchema } from "../src/lib/api-validation";
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from "../src/lib/legal-consent";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("signup intent contract", () => {
  it("carries usage and optional identities through signup, storage and activation", () => {
    const href = signupHrefForPlan("usage", {
      interval: "year",
      usageAddons: { number: false, emailAddress: true },
    });
    const intent = sanitizeSignupIntent(parseSignupIntent(href.split("?")[1]));
    expect(intent).toMatchObject({
      preferredPlanId: "usage",
      preferredBillingInterval: "month",
      preferredUsageAddons: { number: false, emailAddress: true },
    });
    expect(activationBillingHref(intent)).toBe(
      "/settings/billing?plan=usage&interval=month&number=0&email_address=1",
    );
    expect(parseSignupIntent(activationBillingHref(intent).split("?")[1])).toMatchObject({
      preferredUsageAddons: { number: false, emailAddress: true },
    });
    expect(
      signupSchema.parse({
        email: "usage@example.com",
        password: "ValidPass1",
        preferredPlanId: "usage",
        termsAccepted: true,
        termsVersion: ACCOUNT_TERMS_VERSION,
        privacyVersion: ACCOUNT_PRIVACY_VERSION,
      }).preferredPlanId,
    ).toBe("usage");
    expect(
      mergeSignupIntent(intent, {
        preferredPlanId: "personal",
        capturedAt: new Date().toISOString(),
      })?.preferredUsageAddons,
    ).toBeUndefined();
  });
  it("keeps retired pricing aliases aligned with the current public launch catalog", () => {
    expect(SIGNUP_PLAN_IDS).toEqual([
      "usage",
      "personal",
      "voice",
      "email",
      "sms",
      "voice-email",
      "voice-sms",
      "email-sms",
      "omnichannel",
      "voice-regular",
      "voice-high",
      "email-regular",
      "email-high",
      "sms-regular",
      "sms-high",
      "voice-email-regular",
      "voice-email-high",
      "voice-sms-regular",
      "voice-sms-high",
      "email-sms-regular",
      "email-sms-high",
      "omnichannel-regular",
      "omnichannel-high",
      "starter",
      "team",
      "business",
    ]);
    expect(PUBLIC_SIGNUP_PLAN_SLUGS).toEqual({
      usage: "usage",
      voice: "voice",
      email: "email",
      sms: "sms",
      "voice-email": "voice-email",
      "voice-sms": "voice-sms",
      "email-sms": "email-sms",
      omnichannel: "omnichannel",
      "voice-regular": "voice-regular",
      "voice-high": "voice-high",
      "email-regular": "email-regular",
      "email-high": "email-high",
      "sms-regular": "sms-regular",
      "sms-high": "sms-high",
      "voice-email-regular": "voice-email-regular",
      "voice-email-high": "voice-email-high",
      "voice-sms-regular": "voice-sms-regular",
      "voice-sms-high": "voice-sms-high",
      "email-sms-regular": "email-sms-regular",
      "email-sms-high": "email-sms-high",
      "omnichannel-regular": "omnichannel-regular",
      "omnichannel-high": "omnichannel-high",
      personal: "personal",
      starter: "starter",
      team: "starter-plus",
      business: "pro",
    });
    expect(signupHrefForPlan("personal")).toBe("/signup?plan=personal");
    expect(signupHrefForPlan("personal", { interval: "year" })).toBe(
      "/signup?plan=personal&interval=year",
    );
    expect(parseSignupIntent("?plan=personal")?.preferredPlanId).toBe("personal");
    expect(signupHrefForPlan("team", { interval: "year" })).toBe(
      "/signup?plan=starter-plus&interval=year",
    );
    expect(parseSignupIntent("?plan=free")?.preferredPlanId).toBe("personal");
    expect(parseSignupIntent("?plan=builder")?.preferredPlanId).toBe("personal");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=plus")).toMatchObject({
      preferredPlanId: "usage",
      preferredUsageTier: "plus",
    });
    expect(parseSignupIntent("?plan=lite")).toMatchObject({
      preferredPlanId: "usage",
      preferredUsageTier: "lite",
    });
    expect(parseSignupIntent("?plan=starter-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=business-starter-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=pro")?.preferredPlanId).toBe("business");
    expect(parseSignupIntent("?plan=scale")?.preferredPlanId).toBe("business");
    expect(parseSignupIntent("?plan=enterprise")?.preferredPlanId).toBe("business");
    expect(
      signupSchema.parse({
        email: "legacy@example.com",
        password: "ValidPass1",
        preferredPlanId: "enterprise",
        termsAccepted: true,
        termsVersion: ACCOUNT_TERMS_VERSION,
        privacyVersion: ACCOUNT_PRIVACY_VERSION,
      }).preferredPlanId,
    ).toBe("business");
    expect(
      signupSchema.parse({
        email: "scale@example.com",
        password: "ValidPass1",
        preferredPlanId: "scale",
        termsAccepted: true,
        termsVersion: ACCOUNT_TERMS_VERSION,
        privacyVersion: ACCOUNT_PRIVACY_VERSION,
      }).preferredPlanId,
    ).toBe("business");
  });

  it("preserves a trusted role-template choice through signup", () => {
    expect(signupHrefForPlan("personal", { template: "front-desk" })).toBe(
      "/signup?plan=personal&template=front-desk",
    );
    expect(parseSignupIntent("?plan=free&template=front-desk")).toMatchObject({
      preferredPlanId: "personal",
      preferredTemplateId: "front-desk",
    });
    expect(signupTemplateLabel("front-desk")).toBe("Front Desk");
    expect(
      parseSignupIntent("?plan=free&template=not-a-template")?.preferredTemplateId,
    ).toBeUndefined();

    const access = read("src/components/auth/AuthAccessPanel.tsx");
    expect(access).toContain("signupTemplateLabel(intent.preferredTemplateId)");
  });

  it("never emits legacy audience-shaped plan ids from public conversion surfaces", () => {
    const publicSurfaces = [
      "src/components/marketing/PrecisionPublicHeader.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
      "src/components/marketing/MarketingStickyCta.tsx",
      "src/pages/Pricing.tsx",
      "src/pages/Features.tsx",
      "src/pages/Compare.tsx",
      "src/components/usage-billing/UsagePricingPanel.tsx",
    ];
    for (const path of publicSurfaces) {
      expect(read(path), path).not.toMatch(/signup\?plan=(?:personal|team|business)\b/);
    }
  });

  it("preserves an annual pricing choice through signup and server attribution", () => {
    expect(parseSignupIntent("?plan=starter&interval=year")).toMatchObject({
      preferredPlanId: "starter",
      preferredBillingInterval: "year",
    });
    expect(parseSignupIntent("?interval=year")).toMatchObject({
      preferredBillingInterval: "year",
    });
    expect(parseSignupIntent("?plan=starter&interval=weekly")?.preferredBillingInterval).toBe(
      undefined,
    );

    const access = read("src/components/auth/AuthAccessPanel.tsx");
    expect(access).toContain("plan.price_usd_annual");
    expect(access).toContain("candidate.public !== false");
    expect(access).toContain("preferredBillingInterval: effectiveIntent.preferredBillingInterval");
    expect(access).toContain("billing_interval: effectiveIntent?.preferredBillingInterval ?? null");

    const validation = read("src/lib/api-validation.ts");
    expect(validation).toContain('preferredBillingInterval: z.enum(["month", "year"]).optional()');
    expect(validation).toContain("preferredPlanId: publicSignupPlanIdSchema.optional()");
    expect(validation).toContain('["enterprise", "scale", "custom"]');

    const trialGate = read("src/lib/trial-gate.ts");
    expect(trialGate).toContain(
      "signupBillingInterval: attribution.preferredBillingInterval || null",
    );

    const schema = read("src/db/schema.ts");
    expect(schema).toContain('signupBillingInterval: text("signup_billing_interval")');

    const migration = read("drizzle/migrations/0118_add_signup_billing_interval.sql");
    expect(migration).toContain("signup_billing_interval");
    expect(migration).toContain("IN ('month', 'year')");
  });

  it("normalizes stale stored signup intent before it affects onboarding or attribution", () => {
    expect(
      sanitizeSignupIntent({
        preferredPlanId: "starter-plus" as never,
        capturedAt: "2026-07-10T00:00:00.000Z",
      })?.preferredPlanId,
    ).toBe("team");

    expect(
      sanitizeSignupIntent({
        preferredPlanId: "plus" as never,
        capturedAt: "2026-07-10T00:00:00.000Z",
      }),
    ).toMatchObject({ preferredPlanId: "usage", preferredUsageTier: "plus" });

    expect(
      sanitizeSignupIntent({
        preferredPlanId: "unknown" as never,
        capturedAt: "x",
      }),
    ).toBeNull();
    expect(
      sanitizeSignupIntent({
        preferredTemplateId: "not-a-template" as never,
        capturedAt: "x",
      }),
    ).toBeNull();
  });

  it("keeps industry entry plan-neutral while retaining the activation recommendation", () => {
    for (const wedge of SIGNUP_WEDGE_KEYS) {
      const intent = parseSignupIntent(`?wedge=${wedge}`);
      expect(recommendedPlanFromIntent(intent)).toBe("personal");
      expect(activationBillingHref(intent)).toBe("/settings/billing?plan=personal&interval=month");
      expect(signupHrefForWedge(wedge)).toBe(`/signup?wedge=${wedge}`);
      expect(signupHrefForWedge(wedge, "voice-email")).toBe(
        `/signup?wedge=${wedge}&plan=voice-email`,
      );
    }
  });

  it("merges an explicit plan override without erasing acquisition context", () => {
    expect(
      mergeSignupIntent(
        {
          preferredPlanId: "starter",
          signupWedge: "support",
          utmSource: "newsletter",
          utmCampaign: "launch",
          capturedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          preferredPlanId: "personal",
          capturedAt: "2026-08-08T00:00:00.000Z",
        },
      ),
    ).toMatchObject({
      preferredPlanId: "personal",
      signupWedge: "support",
      utmSource: "newsletter",
      utmCampaign: "launch",
    });

    const signupIntent = read("src/lib/signup-intent.ts");
    expect(signupIntent).toContain("mergeSignupIntent(getStoredSignupIntent(), fromUrl)");
  });

  it("captures paid landing attribution before an internal CTA can drop query parameters", () => {
    expect(
      parseSignupIntent("?utm_source=chatgpt&utm_medium=cpc&utm_campaign=wireline_launch_2026_07"),
    ).toMatchObject({
      utmSource: "chatgpt",
      utmMedium: "cpc",
      utmCampaign: "wireline_launch_2026_07",
    });

    const main = read("src/main.tsx");
    expect(main).toContain(
      'import { captureSignupIntentFromLocation, hasSignupIntent } from "./lib/signup-intent";',
    );
    expect(main).toContain("captureSignupIntentFromLocation()");
    expect(main).toContain('event: "signup_intent_captured"');
    expect(main).toContain("hasSignupIntent(signupIntent)");
  });
});
