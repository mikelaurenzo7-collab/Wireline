import { describe, expect, it } from "vitest";
import { parseSignupIntent, recommendedPlanFromIntent } from "./signup-intent";

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
});
