import { describe, expect, it } from "vitest";
import { isFullBleedAppRoute, shouldShowAppPageContext } from "./wireline-app-chrome";

describe("wireline-app-chrome", () => {
  it("treats Chat as full-bleed (no duplicate page context)", () => {
    expect(isFullBleedAppRoute("/chat")).toBe(true);
    expect(shouldShowAppPageContext("/chat")).toBe(false);
  });

  it("shows page context on standard console routes", () => {
    expect(shouldShowAppPageContext("/ops")).toBe(true);
    expect(shouldShowAppPageContext("/agents")).toBe(true);
  });
});
