/**
 * navigation-accent.test.ts — route accent pairs stay on-brand.
 */
import { describe, expect, it } from "vitest";
import { getRouteAccent, getRouteAccentFromLocation, ROUTE_ACCENTS } from "./navigation";
import { BRAND, ROUTE_ACCENT_DEFAULT } from "./brand-colors";

const ALLOWED_ROUTE_HEX = new Set([
  BRAND.purple,
  BRAND.purpleDeep,
  BRAND.purpleLight,
  BRAND.purpleMuted,
  BRAND.creamWarm,
  BRAND.creamDeep,
  BRAND.rose,
]);

/** Legacy hues that must never appear in route accent pairs. */
const LEGACY_OFF_BRAND = new Set([
  "#10B981",
  "#34D399",
  "#F59E0B",
  "#FFC07D",
  "#3B82F6",
  "#0EA5E9",
  "#2563EB",
]);

function assertOnBrand(pair: readonly [string, string]) {
  for (const hex of pair) {
    expect(LEGACY_OFF_BRAND.has(hex.toUpperCase()), `${hex} is off-brand`).toBe(false);
    expect(ALLOWED_ROUTE_HEX.has(hex), `${hex} is not in brand palette`).toBe(true);
  }
}

describe("getRouteAccent", () => {
  it("returns exact pathname accents", () => {
    expect(getRouteAccent("/ops")).toEqual(ROUTE_ACCENTS["/ops"]);
    expect(getRouteAccent("/phone")).toEqual(ROUTE_ACCENTS["/phone"]);
  });

  it("falls back to first path segment", () => {
    expect(getRouteAccent("/chat/agent-123")).toEqual(ROUTE_ACCENTS["/chat"]);
  });

  it("defaults to brand purple when unknown", () => {
    expect(getRouteAccent("/unknown-surface")).toEqual(ROUTE_ACCENT_DEFAULT);
  });
});

describe("getRouteAccentFromLocation", () => {
  it("tints Live Ops intel tab within purple/cream", () => {
    assertOnBrand(getRouteAccentFromLocation("/ops", "?tab=intel"));
  });

  it("tints Live Ops analytics tab within purple/cream", () => {
    assertOnBrand(getRouteAccentFromLocation("/ops", "?tab=analytics"));
  });

  it("tints Phone outbound tab", () => {
    expect(getRouteAccentFromLocation("/phone", "?tab=outbound")).toEqual(
      ROUTE_ACCENTS["/outbound"],
    );
  });

  it("tints Phone appointments tab", () => {
    expect(getRouteAccentFromLocation("/phone", "?tab=appointments")).toEqual(
      ROUTE_ACCENTS["/appointments"],
    );
  });

  it("uses training accent on /training", () => {
    expect(getRouteAccentFromLocation("/training", "")).toEqual(ROUTE_ACCENTS["/training"]);
  });

  it("uses contact profile accent for /contact/:number", () => {
    assertOnBrand(getRouteAccentFromLocation("/contact/+15551234567", ""));
  });
});

describe("ROUTE_ACCENTS palette", () => {
  it("never uses legacy blues, oranges, or teals", () => {
    for (const pair of Object.values(ROUTE_ACCENTS)) {
      assertOnBrand(pair);
    }
  });
});
