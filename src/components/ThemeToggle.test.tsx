import { describe, expect, it } from "vitest";
import { buildThemeToggleLabel } from "./ThemeToggle";

describe("buildThemeToggleLabel", () => {
  it("describes the next mode for system preference", () => {
    expect(buildThemeToggleLabel("system", "light")).toBe(
      "Theme: system (light). Activate light mode.",
    );
  });

  it("describes the next mode for explicit light theme", () => {
    expect(buildThemeToggleLabel("light", "light")).toBe("Theme: light. Activate dark mode.");
  });

  it("describes the next mode for explicit dark theme", () => {
    expect(buildThemeToggleLabel("dark", "dark")).toBe("Theme: dark. Activate system preference.");
  });
});
