import { describe, expect, it } from "vitest";
import {
  isFullBleedAppRoute,
  shouldShowAppPageContext,
  shouldShowTopBarThemeToggle,
} from "./wireline-app-chrome";

describe("wireline-app-chrome", () => {
  it("treats Chat as full-bleed (no duplicate page context)", () => {
    expect(isFullBleedAppRoute("/chat")).toBe(true);
    expect(shouldShowAppPageContext("/chat")).toBe(false);
  });

  it("treats Studio as full-bleed so the three-column builder gets the canvas", () => {
    expect(isFullBleedAppRoute("/agents")).toBe(true);
    expect(shouldShowAppPageContext("/agents")).toBe(false);
    expect(shouldShowTopBarThemeToggle("/agents")).toBe(true);
  });

  it("shows page context on standard console routes", () => {
    expect(shouldShowAppPageContext("/ops")).toBe(true);
    expect(shouldShowAppPageContext("/insights")).toBe(true);
  });

  it("routes theme toggle to AppShell chrome except on full-bleed pages", () => {
    expect(shouldShowTopBarThemeToggle("/chat")).toBe(true);
    expect(shouldShowTopBarThemeToggle("/ops")).toBe(false);
  });
});
