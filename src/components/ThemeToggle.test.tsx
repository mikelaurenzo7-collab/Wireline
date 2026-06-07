import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";

const toggleTheme = vi.fn();
let theme: "system" | "light" | "dark" = "system";
let resolvedTheme: "light" | "dark" = "light";

vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme,
    resolvedTheme,
    toggleTheme,
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    theme = "system";
    resolvedTheme = "light";
  });

  it("describes the next mode for system preference", () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Theme: system (light). Activate light mode.",
    );
  });

  it("describes the next mode for explicit light theme", () => {
    theme = "light";
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Theme: light. Activate dark mode.",
    );
  });

  it("describes the next mode for explicit dark theme", () => {
    theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute(
      "aria-label",
      "Theme: dark. Activate system preference.",
    );
  });
});
