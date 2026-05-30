/**
 * marketing-mobile — pin the exact list of routes that show the fixed
 * mobile conversion bar. A regression here either hides the CTA on a
 * launch landing page (lost revenue) or shows it on a signed-in route
 * where it overlaps console chrome.
 */
import { describe, it, expect } from "vitest";
import { isMarketingStickyCtaRoute, MARKETING_STICKY_CTA_BOTTOM } from "./marketing-mobile.js";

describe("isMarketingStickyCtaRoute", () => {
  it.each(["/", "/pricing", "/compare", "/about", "/showcase"])(
    "returns true for known landing route %s",
    (path) => {
      expect(isMarketingStickyCtaRoute(path)).toBe(true);
    },
  );

  it("matches every /for/* vertical landing page", () => {
    expect(isMarketingStickyCtaRoute("/for/dentists")).toBe(true);
    expect(isMarketingStickyCtaRoute("/for/")).toBe(true);
  });

  it("returns false for signed-in console routes", () => {
    expect(isMarketingStickyCtaRoute("/chat")).toBe(false);
    expect(isMarketingStickyCtaRoute("/agents")).toBe(false);
    expect(isMarketingStickyCtaRoute("/admin")).toBe(false);
  });

  it("does NOT loosely substring-match (e.g. /pricing-extra)", () => {
    expect(isMarketingStickyCtaRoute("/pricing-extra")).toBe(false);
    expect(isMarketingStickyCtaRoute("/showcaseX")).toBe(false);
  });
});

describe("MARKETING_STICKY_CTA_BOTTOM", () => {
  it("clears the sticky bar height + iOS home indicator inset", () => {
    expect(MARKETING_STICKY_CTA_BOTTOM).toContain("5.25rem");
    expect(MARKETING_STICKY_CTA_BOTTOM).toContain("env(safe-area-inset-bottom");
  });
});
