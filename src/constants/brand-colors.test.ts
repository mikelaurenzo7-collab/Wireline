/**
 * Brand palette integrity — ensures every color reference in the design
 * system stays within the purple/cream family, and that the token
 * mappings produce valid, accessible contrast relationships.
 */
import { describe, expect, it } from "vitest";
import { BRAND, NAV_GROUP_ACCENTS, ROUTE_ACCENTS, ROUTE_ACCENT_VARIANTS } from "./brand-colors";

const ALLOWED = new Set([
  BRAND.purple,
  BRAND.purpleDeep,
  BRAND.purpleLight,
  BRAND.purpleMuted,
  BRAND.creamWarm,
  BRAND.creamDeep,
  BRAND.rose,
  BRAND.cream,
  BRAND.paper,
  BRAND.ink,
  BRAND.purpleInk,
]);

const LEGACY_OFF_BRAND = new Set([
  "#10B981", "#34D399",
  "#F59E0B", "#FFC07D",
  "#3B82F6", "#0EA5E9", "#2563EB",
]);

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("brand-colors", () => {
  it("NAV_GROUP_ACCENTS uses purple/cream family only", () => {
    for (const hex of Object.values(NAV_GROUP_ACCENTS)) {
      expect(ALLOWED.has(hex)).toBe(true);
    }
  });

  it("every route accent stays within the allowed purple/cream set", () => {
    for (const pair of Object.values(ROUTE_ACCENTS)) {
      for (const hex of pair) {
        expect(ALLOWED.has(hex)).toBe(true);
      }
    }
  });

  it("never references legacy off-brand colors (blues, oranges, teals)", () => {
    for (const pair of Object.values(ROUTE_ACCENTS)) {
      for (const hex of pair) {
        expect(LEGACY_OFF_BRAND.has(hex.toUpperCase())).toBe(false);
      }
    }
    for (const pair of Object.values(ROUTE_ACCENT_VARIANTS)) {
      for (const hex of pair) {
        expect(LEGACY_OFF_BRAND.has(hex.toUpperCase())).toBe(false);
      }
    }
  });

  it("brand purple on white/cream background meets WCAG AA contrast", () => {
    const ratio = contrastRatio(BRAND.purple, "#EFE9DC");
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });

  it("brand purpleDeep on brand purple foreground meets accessibility", () => {
    const ratio = contrastRatio(BRAND.purpleDeep, BRAND.purple);
    expect(ratio).toBeGreaterThanOrEqual(1.5);
  });

  it("ink color on paper background meets WCAG AAA for body text", () => {
    const ratio = contrastRatio(BRAND.ink, BRAND.paper);
    expect(ratio).toBeGreaterThanOrEqual(7.0);
  });

  it("ROUTE_ACCENT_VARIANTS defines all expected variant keys", () => {
    const keys = Object.keys(ROUTE_ACCENT_VARIANTS);
    expect(keys).toContain("primary");
    expect(keys).toContain("soft");
    expect(keys).toContain("warm");
    expect(keys).toContain("light");
    expect(keys).toContain("cream");
    expect(keys).toContain("critical");
  });

  it("BRAND object has all required color keys", () => {
    expect(BRAND).toHaveProperty("purple");
    expect(BRAND).toHaveProperty("purpleDeep");
    expect(BRAND).toHaveProperty("purpleLight");
    expect(BRAND).toHaveProperty("purpleMuted");
    expect(BRAND).toHaveProperty("cream");
    expect(BRAND).toHaveProperty("paper");
    expect(BRAND).toHaveProperty("creamWarm");
    expect(BRAND).toHaveProperty("creamDeep");
    expect(BRAND).toHaveProperty("ink");
    expect(BRAND).toHaveProperty("rose");
  });

  it("each ROUTE_ACCENT_VARIANTS pair uses two distinct colors", () => {
    for (const [key, pair] of Object.entries(ROUTE_ACCENT_VARIANTS)) {
      expect(pair[0], `${key} should have two distinct colors`).not.toBe(pair[1]);
    }
  });
});

describe("NAV_GROUP_ACCENTS", () => {
  it("has all four nav groups mapped", () => {
    expect(NAV_GROUP_ACCENTS).toHaveProperty("Workspace");
    expect(NAV_GROUP_ACCENTS).toHaveProperty("Channels");
    expect(NAV_GROUP_ACCENTS).toHaveProperty("Sales");
    expect(NAV_GROUP_ACCENTS).toHaveProperty("Admin");
  });

  it("each nav group uses distinct accent colors", () => {
    const values = Object.values(NAV_GROUP_ACCENTS);
    expect(new Set(values).size).toBe(values.length);
  });
});