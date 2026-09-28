import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  STRIPE_PUBLIC_BRAND,
  STRIPE_PUBLIC_SUPPORT_EMAIL,
  STRIPE_PUBLIC_SUPPORT_URL,
  hasBotBoundDescriptor,
} from "../scripts/lib/stripe-account-identity.mjs";
import { CANONICAL_PRODUCTION_URL } from "../scripts/lib/production-url.mjs";

const source = readFileSync(resolve("scripts/check-vendor-readiness.mjs"), "utf8");

function section(start: string, end: string): string {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  if (first < 0 || last <= first) throw new Error("Vendor readiness section was not found");
  return source.slice(first, last);
}

// Execute the production brand decision itself, without importing the top-level
// provider probe or mocking away the public-name selection under regression.
const brandDecision = [
  section("function httpsOrigin(", "function arrayAt("),
  section("const stripePublicName =", "const stripePortalConfigs ="),
  "({ publicName: stripePublicName, brandReady: stripeBrandReady })",
].join("\n");

function evaluateName(publicName: string | null | undefined, dashboardName: string) {
  return runInNewContext(brandDecision, {
    URL,
    STRIPE_PUBLIC_BRAND,
    STRIPE_PUBLIC_SUPPORT_EMAIL,
    STRIPE_PUBLIC_SUPPORT_URL,
    CANONICAL_PRODUCTION_URL,
    hasBotBoundDescriptor,
    stripeAccount: {
      ok: true,
      body: {
        business_profile: {
          name: publicName,
          url: CANONICAL_PRODUCTION_URL,
          support_url: STRIPE_PUBLIC_SUPPORT_URL,
          support_email: STRIPE_PUBLIC_SUPPORT_EMAIL,
        },
        settings: {
          dashboard: { display_name: dashboardName },
          payments: { statement_descriptor: "BOTBOUND" },
        },
      },
    },
  }) as { publicName: string; brandReady: boolean };
}

describe("vendor Stripe customer-facing name regression", () => {
  it("rejects an absent public name even when the internal Dashboard says BotBound", () => {
    for (const missing of [undefined, null, ""]) {
      expect(evaluateName(missing, "BotBound")).toEqual({ publicName: "", brandReady: false });
    }
  });

  it("rejects a stale public name even when the internal Dashboard says BotBound", () => {
    expect(evaluateName("TryWireline", "BotBound")).toEqual({
      publicName: "TryWireline",
      brandReady: false,
    });
  });

  it("accepts the actual BotBound public name independently of the internal label", () => {
    expect(evaluateName("BotBound", "TryWireline")).toEqual({
      publicName: "BotBound",
      brandReady: true,
    });
  });
});
