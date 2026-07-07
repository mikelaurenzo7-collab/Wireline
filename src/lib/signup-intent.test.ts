import { describe, expect, it } from "vitest";
import {
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
} from "./signup-intent";

describe("signup-intent", () => {
  it("normalizes retired plan ids into the current commercial model", () => {
    expect(parseSignupIntent("?plan=personal-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=starter")?.preferredPlanId).toBe("business");
    expect(parseSignupIntent("?plan=scale")?.preferredPlanId).toBe("enterprise");
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
