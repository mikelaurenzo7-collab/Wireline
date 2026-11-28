import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCaptureTheme,
  THEME_STORAGE_KEY,
  visualCaptureTheme,
} from "../scripts/lib/visual-capture-theme.mjs";

describe("visual capture theme", () => {
  it("defaults to light, accepts dark, and refuses anything else", () => {
    expect(visualCaptureTheme({})).toBe("light");
    expect(visualCaptureTheme({ WIRELINE_VISUAL_THEME: " Dark " })).toBe("dark");
    expect(() => visualCaptureTheme({ WIRELINE_VISUAL_THEME: "system" })).toThrow(/light, dark/);
  });

  it("stores the app's own theme key, because the system preference does not switch it", () => {
    const app = readFileSync(resolve(process.cwd(), "src/contexts/ThemeContext.tsx"), "utf8");
    expect(app).toContain(`const STORAGE_KEY = "${THEME_STORAGE_KEY}";`);
    const stored = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: (key: string, value: string) => stored.set(key, value),
    };
    applyCaptureTheme({ theme: "light", storageKey: THEME_STORAGE_KEY });
    expect(stored.size).toBe(0);
    applyCaptureTheme({ theme: "dark", storageKey: THEME_STORAGE_KEY });
    expect(stored.get("botbound-theme")).toBe("dark");
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("applies the theme in both capture scripts and records it in the manifest", () => {
    for (const script of ["scripts/capture-visual-qa.mjs", "scripts/capture-prod-visual-qa.mjs"]) {
      const source = readFileSync(resolve(process.cwd(), script), "utf8");
      expect(source).toMatch(
        /await context\.addInitScript\(applyCaptureTheme, \{\s*theme: captureTheme,\s*storageKey: THEME_STORAGE_KEY,\s*\}\);/,
      );
      expect(source).toContain("theme: captureTheme,");
    }
  });
});
