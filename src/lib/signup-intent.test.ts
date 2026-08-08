import { describe, expect, it } from "vitest";
import {
  mergeSignupIntent,
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
} from "./signup-intent";

describe("signup-intent", () => {
  it("normalizes retired plan ids into the current commercial model", () => {
    expect(parseSignupIntent("?plan=personal-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=scale")?.preferredPlanId).toBe("enterprise");
  });

  it("lets an explicit Free Builder plan override keep stored acquisition context", () => {
    const merged = mergeSignupIntent(
      {
        preferredPlanId: "business",
        preferredBillingInterval: "year",
        signupWedge: "sales",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "launch",
        capturedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        preferredPlanId: "personal",
        capturedAt: "2026-08-08T00:00:00.000Z",
      },
    );
    expect(merged).toMatchObject({
      preferredPlanId: "personal",
      preferredBillingInterval: "year",
      signupWedge: "sales",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "launch",
      capturedAt: "2026-08-08T00:00:00.000Z",
    });
  });

  it("defaults unqualified signup traffic to Personal Conversation Balance", () => {
    expect(recommendedPlanFromIntent(null)).toBe("personal");
  });

  it("drops unknown plan ids instead of preserving stale pricing walls", () => {
    expect(
      sanitizeSignupIntent({
        preferredPlanId: "everyday" as never,
        capturedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
