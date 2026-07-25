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
