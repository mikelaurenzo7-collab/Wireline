/**
 * brand-token — covers resolveBrandAccent() across the SSR fallback,
 * the explicit-override shortcut, and the live CSS variable read so the
 * single brand-color resolver used by TopBar / PageShell chrome can't
 * silently regress to the wrong purple if --color-brand drifts.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resolveBrandAccent, BRAND_FALLBACK } from "./brand-token.js";

describe("resolveBrandAccent", () => {
  const realWindow = globalThis.window;
  const realDocument = globalThis.document;
  const realGetComputedStyle = globalThis.getComputedStyle;

  afterEach(() => {
    // Restore globals so the next test starts from a clean SSR-like baseline.
    (globalThis as unknown as { window?: Window }).window = realWindow;
    (globalThis as unknown as { document?: Document }).document = realDocument;
    (globalThis as unknown as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle =
      realGetComputedStyle;
    vi.restoreAllMocks();
  });

  it("returns the override verbatim when one is supplied", () => {
    expect(resolveBrandAccent("#123456")).toBe("#123456");
  });

  it("returns BRAND_FALLBACK in SSR (no window/document)", () => {
    (globalThis as unknown as { window?: Window }).window = undefined as unknown as Window;
    expect(resolveBrandAccent()).toBe(BRAND_FALLBACK);
    expect(BRAND_FALLBACK).toMatch(/^#[0-9A-F]{6}$/i);
  });

  describe("in a browser-like env", () => {
    beforeEach(() => {
      (globalThis as unknown as { window: object }).window = {} as Window;
      (globalThis as unknown as { document: object }).document = {
        documentElement: {} as HTMLElement,
      } as Document;
    });

    it("reads --color-brand from the document root when present", () => {
      (globalThis as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle =
        (() => ({ getPropertyValue: () => "  #abcdef  " })) as unknown as typeof getComputedStyle;
      expect(resolveBrandAccent()).toBe("#abcdef");
    });

    it("falls back to BRAND_FALLBACK when --color-brand is empty", () => {
      (globalThis as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle =
        (() => ({ getPropertyValue: () => "" })) as unknown as typeof getComputedStyle;
      expect(resolveBrandAccent()).toBe(BRAND_FALLBACK);
    });

    it("still honors override before touching the DOM", () => {
      const spy = vi.fn(() => ({ getPropertyValue: () => "#zzz" }));
      (globalThis as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle =
        spy as unknown as typeof getComputedStyle;
      expect(resolveBrandAccent("#ff00ff")).toBe("#ff00ff");
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
