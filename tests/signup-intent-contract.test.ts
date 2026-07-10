import { describe, expect, it } from "vitest";
import {
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
} from "../src/lib/signup-intent";

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
  });
});
