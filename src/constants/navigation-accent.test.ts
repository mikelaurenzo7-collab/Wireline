/**
 * Route accent + location-aware tinting for client ambience strip.
 */
import { describe, expect, it } from "vitest";
import { getRouteAccent, getRouteAccentFromLocation, ROUTE_ACCENTS } from "./navigation";

describe("getRouteAccent", () => {
  it("returns exact pathname accents", () => {
    expect(getRouteAccent("/ops")).toEqual(ROUTE_ACCENTS["/ops"]);
    expect(getRouteAccent("/phone")).toEqual(ROUTE_ACCENTS["/phone"]);
  });

  it("falls back to first path segment", () => {
    expect(getRouteAccent("/chat/agent-123")).toEqual(ROUTE_ACCENTS["/chat"]);
  });

  it("defaults to brand purple when unknown", () => {
    expect(getRouteAccent("/unknown-surface")).toEqual(["#4F1E7B", "#4F1E7B"]);
  });
});

describe("getRouteAccentFromLocation", () => {
  it("tints Live Ops intel tab amber", () => {
    expect(getRouteAccentFromLocation("/ops", "?tab=intel")).toEqual(["#FFC07D", "#4F1E7B"]);
  });

  it("tints Live Ops analytics tab emerald", () => {
    expect(getRouteAccentFromLocation("/ops", "?tab=analytics")).toEqual(["#10B981", "#4F1E7B"]);
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
    expect(getRouteAccentFromLocation("/contact/+15551234567", "")).toEqual(["#4F1E7B", "#10B981"]);
  });
});
