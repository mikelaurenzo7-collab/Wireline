import { describe, expect, it } from "vitest";
import {
  getSignupWedgeRecommendation,
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
  signupHrefForWedge,
} from "./signup-intent";

describe("signup intent", () => {
  it("captures valid plan, wedge, and UTM parameters", () => {
    const intent = parseSignupIntent(
      "?plan=pro&wedge=medical&utm_source=linkedin&utm_medium=dm&utm_campaign=clinic",
    );

    expect(intent).toMatchObject({
      preferredPlanId: "pro",
      signupWedge: "medical",
      utmSource: "linkedin",
      utmMedium: "dm",
      utmCampaign: "clinic",
    });
  });

  it("ignores unknown plan and wedge values", () => {
    expect(parseSignupIntent("?plan=enterprise&wedge=unknown")).toBeNull();
  });

  it("defaults upgrade recommendations to starter without intent", () => {
    expect(recommendedPlanFromIntent(null)).toBe("starter");
    expect(recommendedPlanFromIntent(parseSignupIntent("?plan=business"))).toBe("business");
  });

  it("recommends plans and templates from wedge-only intent", () => {
    const medical = parseSignupIntent("?wedge=medical");
    const personal = parseSignupIntent("?wedge=personal");
    const sales = parseSignupIntent("?wedge=sales");

    expect(recommendedPlanFromIntent(medical)).toBe("starter");
    expect(recommendedPlanFromIntent(personal)).toBe("personal");
    expect(recommendedPlanFromIntent(sales)).toBe("pro");
    expect(getSignupWedgeRecommendation("medical")?.templateId).toBe("scheduler-medical");
  });

  it("builds signup URLs with wedge default plan", () => {
    expect(signupHrefForWedge("sales")).toBe("/signup?wedge=sales&plan=pro");
    expect(signupHrefForWedge("medical", "business")).toBe("/signup?wedge=medical&plan=business");
  });

  it("sanitizes stale localStorage intent with invalid plan or wedge", () => {
    const stale = {
      preferredPlanId: "enterprise",
      signupWedge: "unknown",
      utmSource: "linkedin",
      capturedAt: "2025-01-01T00:00:00.000Z",
    } as const;

    expect(sanitizeSignupIntent(stale)).toMatchObject({
      utmSource: "linkedin",
    });
    expect(sanitizeSignupIntent(stale)?.preferredPlanId).toBeUndefined();
    expect(sanitizeSignupIntent(stale)?.signupWedge).toBeUndefined();
  });

  it("keeps valid attribution fields when sanitizing", () => {
    expect(
      sanitizeSignupIntent({
        preferredPlanId: "pro",
        signupWedge: "medical",
        capturedAt: "2025-01-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      preferredPlanId: "pro",
      signupWedge: "medical",
    });
  });
});
