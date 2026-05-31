/**
 * Route accent alignment — ensures every route accent pair stays
 * within the purple/cream brand palette, falls back correctly,
 * and tab-specific overrides resolve to valid accent variants.
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

const LEGACY_OFF_BRAND = new Set([
  "#10B981", "#34D399",
  "#F59E0B", "#FFC07D",
  "#3B82F6", "#0EA5E9", "#2563EB",
]);

function assertOnBrand(pair: readonly [string, string]) {
  for (const hex of pair) {
    expect(LEGACY_OFF_BRAND.has(hex.toUpperCase())).toBe(false);
    expect(ALLOWED_ROUTE_HEX.has(hex)).toBe(true);
  }
}

describe("route accent resolution", () => {
  it("getRouteAccent returns exact pathname accents for known routes", () => {
    expect(getRouteAccent("/ops")).toEqual(ROUTE_ACCENTS["/ops"]);
    expect(getRouteAccent("/phone")).toEqual(ROUTE_ACCENTS["/phone"]);
    expect(getRouteAccent("/chat")).toEqual(ROUTE_ACCENTS["/chat"]);
    expect(getRouteAccent("/training")).toEqual(ROUTE_ACCENTS["/training"]);
    expect(getRouteAccent("/admin")).toEqual(ROUTE_ACCENTS["/admin"]);
  });

  it("getRouteAccent falls back to first path segment for sub-routes", () => {
    expect(getRouteAccent("/chat/agent-123")).toEqual(ROUTE_ACCENTS["/chat"]);
    expect(getRouteAccent("/phone/call/456")).toEqual(ROUTE_ACCENTS["/phone"]);
    expect(getRouteAccent("/admin/team")).toEqual(ROUTE_ACCENTS["/admin"]);
  });

  it("getRouteAccent defaults to brand purple when route is unknown", () => {
    expect(getRouteAccent("/unknown-surface")).toEqual(ROUTE_ACCENT_DEFAULT);
  });

  it("all route accent pairs are on-brand", () => {
    for (const pair of Object.values(ROUTE_ACCENTS)) {
      assertOnBrand(pair);
    }
  });

  it("ROUTE_ACCENT_DEFAULT is a valid on-brand pair", () => {
    assertOnBrand(ROUTE_ACCENT_DEFAULT);
  });
});

describe("getRouteAccentFromLocation tab overrides", () => {
  it("tints Live Ops intel tab to cream variant", () => {
    const accent = getRouteAccentFromLocation("/ops", "?tab=intel");
    assertOnBrand(accent);
    expect(accent).not.toEqual(ROUTE_ACCENTS["/ops"]);
  });

  it("tints Live Ops analytics tab to light variant", () => {
    const accent = getRouteAccentFromLocation("/ops", "?tab=analytics");
    assertOnBrand(accent);
    expect(accent).not.toEqual(ROUTE_ACCENTS["/ops"]);
  });

  it("returns default ops accent for unknown Live Ops tab", () => {
    expect(getRouteAccentFromLocation("/ops", "?tab=unknown")).toEqual(ROUTE_ACCENTS["/ops"]);
  });

  it("tints Phone outbound tab to outbound accent", () => {
    expect(getRouteAccentFromLocation("/phone", "?tab=outbound")).toEqual(
      ROUTE_ACCENTS["/outbound"],
    );
  });

  it("tints Phone appointments tab to appointments accent", () => {
    expect(getRouteAccentFromLocation("/phone", "?tab=appointments")).toEqual(
      ROUTE_ACCENTS["/appointments"],
    );
  });

  it("uses training accent for /training regardless of query", () => {
    expect(getRouteAccentFromLocation("/training", "")).toEqual(ROUTE_ACCENTS["/training"]);
    expect(getRouteAccentFromLocation("/training", "?tab=xyz")).toEqual(ROUTE_ACCENTS["/training"]);
  });

  it("uses valid on-brand accent for /contact/:number", () => {
    assertOnBrand(getRouteAccentFromLocation("/contact/+15551234567", ""));
  });

  it("returns default accent for unknown phone tab", () => {
    expect(getRouteAccentFromLocation("/phone", "?tab=unknown")).toEqual(ROUTE_ACCENTS["/phone"]);
  });
});

describe("route accent data integrity", () => {
  it("all route accent pairs are on-brand", () => {
    for (const pair of Object.values(ROUTE_ACCENTS)) {
      assertOnBrand(pair);
    }
  });
});