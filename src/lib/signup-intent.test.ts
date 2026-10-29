import { describe, expect, it } from "vitest";
import {
  activationBillingHref,
  billingIntervalFromIntent,
  captureSignupIntentFromLocation,
  mergeSignupIntent,
  parseSignupIntent,
  recommendedPlanFromIntent,
  sanitizeSignupIntent,
  signupTemplateLabel,
  usageAddonsFromIntent,
} from "./signup-intent";

describe("signup-intent", () => {
  it("never adds a paid number without an explicit selection", () => {
    expect(usageAddonsFromIntent(null)).toEqual({ number: false, emailAddress: false });
    expect(usageAddonsFromIntent(parseSignupIntent("?plan=usage&tier=standard"))).toEqual({
      number: false,
      emailAddress: false,
    });
    expect(usageAddonsFromIntent(parseSignupIntent("?plan=usage&email_address=1"))).toEqual({
      number: false,
      emailAddress: true,
    });
    expect(
      usageAddonsFromIntent(parseSignupIntent("?plan=usage&number=1&email_address=0")),
    ).toEqual({
      number: true,
      emailAddress: false,
    });
  });
  it("normalizes retired plan ids into the current commercial model", () => {
    expect(parseSignupIntent("?plan=personal-plus")?.preferredPlanId).toBe("team");
    expect(parseSignupIntent("?plan=business-starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=starter")?.preferredPlanId).toBe("starter");
    expect(parseSignupIntent("?plan=lite")).toMatchObject({
      preferredPlanId: "usage",
      preferredUsageTier: "lite",
    });
    expect(parseSignupIntent("?plan=plus")).toMatchObject({
      preferredPlanId: "usage",
      preferredUsageTier: "plus",
    });
    expect(parseSignupIntent("?plan=standard")).toMatchObject({
      preferredPlanId: "usage",
      preferredUsageTier: "standard",
    });
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

  it("defaults unqualified signup traffic to the paid Personal plan", () => {
    expect(recommendedPlanFromIntent(null)).toBe("personal");
  });

  it("replaces an earlier role with a new solution without losing billing or acquisition context", () => {
    const previous = {
      preferredPlanId: "voice-email" as const,
      preferredBillingInterval: "year" as const,
      preferredTemplateId: "personal-assistant",
      signupWedge: "personal" as const,
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "launch",
      capturedAt: "2026-10-19T00:00:00.000Z",
    };
    const merged = mergeSignupIntent(previous, parseSignupIntent("?wedge=support&plan=free"));

    expect(merged).toMatchObject({
      preferredPlanId: "personal",
      preferredBillingInterval: "year",
      signupWedge: "support",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "launch",
    });
    expect(merged?.preferredTemplateId).toBeUndefined();
    expect(
      mergeSignupIntent(
        previous,
        parseSignupIntent("?wedge=support&plan=free&template=appointment-setter"),
      )?.preferredTemplateId,
    ).toBe("appointment-setter");
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

  it("keeps Personal activation on the paid Personal plan and preserves the selected interval", () => {
    expect(activationBillingHref(parseSignupIntent("?plan=free&interval=year"))).toBe(
      "/settings/billing?plan=personal&interval=year",
    );
    expect(activationBillingHref(null)).toBe("/settings/billing?plan=personal&interval=month");
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

  it("does not keep an earlier plan chip on a plain signup visit", () => {
    const storage = new Map<string, string>([
      [
        "wireline_signup_intent_v1",
        JSON.stringify({
          preferredPlanId: "usage",
          preferredUsageTier: "plus",
          preferredTemplateId: "front-desk",
          preferredBillingInterval: "month",
          capturedAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
    ]);
    const previous = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search: "", pathname: "/signup" },
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
          removeItem: (key: string) => {
            storage.delete(key);
          },
        },
      },
    });
    expect(captureSignupIntentFromLocation()).toBeNull();
    expect(storage.has("wireline_signup_intent_v1")).toBe(false);
    Object.defineProperty(globalThis, "window", { configurable: true, value: previous });
  });
});
