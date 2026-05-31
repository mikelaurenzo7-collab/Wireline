/**
 * ThemeToggle — chrome control that cycles light → dark → system.
 *
 * Designed for the TopBar; tiny footprint (single icon button) but
 * communicates the current resolved theme via the icon (sun = light,
 * moon = dark, monitor = system). Uses the shadcn token system so it
 * looks correct against both light and dark TopBars.
 */
import React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { cn } from "../lib/utils";

interface Props {
  className?: string;
  /** Inverse styling sits on the dark purple TopBar (light-on-purple). */
  variant?: "default" | "inverse";
}

export default function ThemeToggle({ className, variant = "inverse" }: Props) {
  const { theme, toggleTheme, resolvedTheme } = useTheme();

  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  const label =
    theme === "system"
      ? `Theme: system (${resolvedTheme}). Switch to light.`
      : theme === "dark"
        ? "Theme: dark. Switch to system."
        : "Theme: light. Switch to dark.";

  const base =
    "inline-flex items-center justify-center w-9 h-9 md:w-auto md:h-7 md:px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  const palette =
    variant === "inverse"
      ? "chrome-muted hover:text-[#EFE9DC] hover:bg-white/10 focus-visible:ring-offset-transparent"
      : "text-muted-foreground hover:text-foreground hover:bg-accent";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={cn(base, palette, className)}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  );
}
