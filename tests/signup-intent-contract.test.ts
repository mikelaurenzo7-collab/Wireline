import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIGNUP_PLAN_IDS,
  PUBLIC_SIGNUP_PLAN_SLUGS,
  mergeSignupIntent,
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
  signupHrefForPlan,
  signupTemplateLabel,
} from "../src/lib/signup-intent";
import { signupSchema } from "../src/lib/api-validation";
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from "../src/lib/legal-consent";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("signup intent contract", () => {
  it("keeps retired pricing aliases aligned with the current public launch catalog", () => {
    expect(SIGNUP_PLAN_IDS).toEqual(["personal", "starter", "team", "business"]);
    expect(PUBLIC_SIGNUP_PLAN_SLUGS).toEqual({
      personal: "free",
      starter: "starter",
      team: "starter-plus",
      business: "pro",
    });
    expect(signupHrefForPlan("personal")).toBe("/signup?plan=free");
    expect(signupHrefForPlan("team", { interval: "year" })).toBe(
      "/signup?plan=starter-plus&interval=year",
    );
    expect(parseSignupIntent("?plan=free")?.preferredPlanId).toBe("personal");
    expect(parseSignupIntent("?plan=builder")?.preferredPlanId).toBe("personal");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=plus")?.preferredPlanId).toBe("team");
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
      "/signup?plan=free&template=front-desk",
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
      "src/pages/Showcase.tsx",
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
      })?.preferredPlanId,
    ).toBe("team");

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

  it("lets vertical intent choose the plan when the URL did not specify one", () => {
    expect(recommendedPlanFromIntent(parseSignupIntent("?wedge=sales"))).toBe("business");
    expect(recommendedPlanFromIntent(parseSignupIntent("?wedge=home-services"))).toBe("team");
    expect(recommendedPlanFromIntent(parseSignupIntent("?wedge=support"))).toBe("starter");
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
