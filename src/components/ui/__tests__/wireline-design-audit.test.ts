/**
 * Wireline design audit — app-wide static contract (authenticated + marketing scopes).
 */
import { describe, it, expect } from "vitest";
import {
  countPatternInScope,
  DESIGN_AUDIT_BASELINE,
  APP_MICRO_TEXT_8_PATTERN,
  APP_MICRO_TEXT_9_PATTERN,
  APP_MICRO_TEXT_10_PATTERN,
  OFF_BRAND_GRADIENT_PATTERN,
  OFF_BRAND_HEX_PATTERN,
  EQUAL_VIEWPORT_SURFACES,
  WIDE_VIEWPORT_LAYOUT_PATTERN,
  surfaceEscalatesViewport,
  findViewportRegressions,
} from "../../../lib/wireline-design-audit";

function assertMax(actual: number, max: number, metric: string) {
  if (actual > max) {
    throw new Error(
      `${metric} = ${actual} exceeds max ${max}. Fix drift or update baseline intentionally.`,
    );
  }
  expect(actual).toBeLessThanOrEqual(max);
}

describe("wireline design audit — authenticated app surfaces", () => {
  it("has no aurora-ring in app components or pages", () => {
    assertMax(
      countPatternInScope(/\baurora-ring\b/g, "app"),
      DESIGN_AUDIT_BASELINE.appAuroraRing,
      "app aurora-ring",
    );
  });

  it("has no brutal-btn in app components or pages", () => {
    assertMax(
      countPatternInScope(/\bbrutal-btn\b/g, "app"),
      DESIGN_AUDIT_BASELINE.appBrutalBtn,
      "app brutal-btn",
    );
  });

  it("has no decorative off-brand hex literals in app code", () => {
    assertMax(
      countPatternInScope(OFF_BRAND_HEX_PATTERN, "app"),
      DESIGN_AUDIT_BASELINE.appOffBrandHex,
      "app off-brand hex",
    );
  });

  it("has no off-hue Tailwind gradient literals in app code", () => {
    assertMax(
      countPatternInScope(OFF_BRAND_GRADIENT_PATTERN, "app"),
      DESIGN_AUDIT_BASELINE.appOffBrandGradient,
      "app off-brand gradients",
    );
  });

  it("has no .glass utility in app feature code", () => {
    assertMax(
      countPatternInScope(/\bglass(?!\w)/g, "app"),
      DESIGN_AUDIT_BASELINE.appGlassUtility,
      "app .glass",
    );
  });

  it("has no text-[8px] micro labels in app code", () => {
    assertMax(
      countPatternInScope(APP_MICRO_TEXT_8_PATTERN, "app"),
      DESIGN_AUDIT_BASELINE.appText8px,
      "app text-[8px]",
    );
  });

  it("has no text-[9px] micro labels in app code", () => {
    assertMax(
      countPatternInScope(APP_MICRO_TEXT_9_PATTERN, "app"),
      DESIGN_AUDIT_BASELINE.appText9px,
      "app text-[9px]",
    );
  });

  it("has no text-[10px] arbitrary micro labels in app code", () => {
    assertMax(
      countPatternInScope(APP_MICRO_TEXT_10_PATTERN, "app"),
      DESIGN_AUDIT_BASELINE.appText10px,
      "app text-[10px]",
    );
  });
});

describe("wireline design audit — marketing surfaces", () => {
  it("allows aurora-ring only within marketing budget", () => {
    assertMax(
      countPatternInScope(/\baurora-ring\b/g, "marketing"),
      DESIGN_AUDIT_BASELINE.marketingAuroraRingMax,
      "marketing aurora-ring",
    );
  });

  it("keeps marketing free of brutal-btn", () => {
    expect(countPatternInScope(/\bbrutal-btn\b/g, "marketing")).toBe(0);
  });
});

describe("wireline design audit — equal-viewport contract (#356)", () => {
  it("curates a non-empty set of full-width operator data surfaces", () => {
    expect(EQUAL_VIEWPORT_SURFACES.length).toBeGreaterThanOrEqual(12);
    // No duplicate entries — each surface is pinned exactly once.
    expect(new Set(EQUAL_VIEWPORT_SURFACES).size).toBe(EQUAL_VIEWPORT_SURFACES.length);
  });

  it("every curated operator surface escalates layout past lg: into xl:/2xl:", () => {
    const regressions = findViewportRegressions();
    if (regressions.length > 0) {
      throw new Error(
        `These operator surfaces no longer escalate into xl:/2xl: (equal-viewport regression — ` +
          `add wide-desktop columns/spans/widths so 1440px+ doesn't render like a tablet): ` +
          regressions.join(", "),
      );
    }
    expect(regressions).toEqual([]);
  });

  it.each(EQUAL_VIEWPORT_SURFACES)("%s carries a wide-viewport layout escalation", (rel) => {
    expect(surfaceEscalatesViewport(rel)).toBe(true);
  });

  it("matches genuine layout escalations but not incidental xl: utilities", () => {
    expect(WIDE_VIEWPORT_LAYOUT_PATTERN.test("xl:grid-cols-4")).toBe(true);
    expect(WIDE_VIEWPORT_LAYOUT_PATTERN.test("2xl:col-span-3")).toBe(true);
    expect(WIDE_VIEWPORT_LAYOUT_PATTERN.test("xl:max-w-[60rem]")).toBe(true);
    expect(WIDE_VIEWPORT_LAYOUT_PATTERN.test("xl:text-lg")).toBe(false);
    expect(WIDE_VIEWPORT_LAYOUT_PATTERN.test("md:grid-cols-2")).toBe(false);
  });
});
