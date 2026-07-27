import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
} from "../src/lib/signup-intent";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("signup intent contract", () => {
  it("keeps retired pricing aliases aligned with the current public launch catalog", () => {
    expect(parseSignupIntent("?plan=free")?.preferredPlanId).toBe("personal");
    expect(parseSignupIntent("?plan=builder")?.preferredPlanId).toBe("personal");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=starter-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=business-starter-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=pro")?.preferredPlanId).toBe("business");
    expect(parseSignupIntent("?plan=scale")?.preferredPlanId).toBe("enterprise");
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

    const portal = read("src/components/AuthPortal.tsx");
    expect(portal).toContain("plan.price_usd_annual");
    expect(portal).toContain(
      "preferredBillingInterval: attribution.preferredBillingInterval",
    );
    expect(portal).toContain(
      "billing_interval: attribution?.preferredBillingInterval ?? null",
    );

    const validation = read("src/lib/api-validation.ts");
    expect(validation).toContain(
      'preferredBillingInterval: z.enum(["month", "year"]).optional()',
    );

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
  });

  it("lets vertical intent choose the plan when the URL did not specify one", () => {
    expect(recommendedPlanFromIntent(parseSignupIntent("?wedge=sales"))).toBe("business");
    expect(recommendedPlanFromIntent(parseSignupIntent("?wedge=home-services"))).toBe("team");
    expect(recommendedPlanFromIntent(parseSignupIntent("?wedge=support"))).toBe("starter");
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
