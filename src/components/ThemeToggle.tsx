/**
 * ThemeToggle — retired. Wireline ships light-only now, so the theme switcher
 * renders nothing. The component (and the label helper) are kept so every
 * TopBar / WorkspaceTopBar / Sidebar consumer keeps compiling without churn.
 */
import { forwardRef } from "react";

interface Props {
  className?: string;
  /** Legacy styling hint — ignored now that the control is a no-op. */
  variant?: "default" | "inverse";
  /** Legacy compact flag — ignored now that the control is a no-op. */
  compact?: boolean;
}

export function buildThemeToggleLabel(
  theme: "system" | "light" | "dark",
  resolvedTheme: "light" | "dark",
): string {
  const nextMode =
    theme === "system" ? "light mode" : theme === "light" ? "dark mode" : "system preference";
  const currentMode =
    theme === "system" ? `system (${resolvedTheme})` : theme === "light" ? "light" : "dark";
  return `Theme: ${currentMode}. Activate ${nextMode}.`;
}

const ThemeToggle = forwardRef<HTMLButtonElement, Props>(function ThemeToggle() {
  return null;
});

export default ThemeToggle;
