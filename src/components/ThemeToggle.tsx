import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { cn } from "../lib/utils";

interface Props {
  className?: string;
  variant?: "default" | "inverse";
}

export default function ThemeToggle({ className, variant = "inverse" }: Props) {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  const base =
    "inline-flex items-center justify-center w-9 h-9 md:w-auto md:h-7 md:px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  const palette =
    variant === "inverse"
      ? "chrome-muted hover:text-[#F4F1EA] hover:bg-white/10 focus-visible:ring-offset-transparent"
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