import { describe, expect, it } from "vitest";
import {
  activationBillingHref,
  billingIntervalFromIntent,
  mergeSignupIntent,
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
  signupTemplateLabel,
} from "./signup-intent";

describe("signup-intent", () => {
  it("normalizes retired plan ids into the current commercial model", () => {
    expect(parseSignupIntent("?plan=personal-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=scale")?.preferredPlanId).toBe("business");
    expect(parseSignupIntent("?plan=enterprise")?.preferredPlanId).toBe("business");
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

  it("defaults unqualified signup traffic to Free Builder", () => {
    expect(recommendedPlanFromIntent(null)).toBe("personal");
  });

  it("preserves only a known role starter and renders its BotBound label", () => {
    expect(parseSignupIntent("?plan=free&template=front-desk")?.preferredTemplateId).toBe(
      "front-desk",
    );
    expect(signupTemplateLabel("front-desk")).toBe("Front Desk");
    expect(parseSignupIntent("?template=not-a-real-role")).toBeNull();
  });

  it("drops unknown plan ids instead of preserving stale pricing walls", () => {
    expect(
      sanitizeSignupIntent({
        preferredPlanId: "everyday" as never,
        capturedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("carries the selected paid plan and annual interval into activation", () => {
    expect(activationBillingHref(parseSignupIntent("?plan=email&interval=year"))).toBe(
      "/settings/billing?plan=email&interval=year",
    );
  });

  it("keeps Free Builder activation on Calls and preserves the selected interval", () => {
    expect(activationBillingHref(parseSignupIntent("?plan=free&interval=year"))).toBe(
      "/settings/billing?plan=voice-regular&interval=year",
    );
    expect(activationBillingHref(null)).toBe("/settings/billing?plan=voice-regular&interval=month");
  });

  it.each([
    ["?interval=month", "year", "month"],
    ["?interval=year", "month", "year"],
    ["", "year", "year"],
    ["?interval=weekly", "year", "year"],
    ["", "month", "month"],
  ] as const)(
    "resolves billing choice %s ahead of stored %s",
    (search, preferredBillingInterval, expected) => {
      expect(
        billingIntervalFromIntent(
          { preferredBillingInterval, capturedAt: "2026-09-09T00:00:00Z" },
          search,
        ),
      ).toBe(expected);
    },
  );
});
