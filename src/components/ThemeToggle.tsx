/**
 * ThemeToggle — chrome control that cycles light → dark → system.
 *
 * Designed for the TopBar; tiny footprint (single icon button) but
 * communicates the current resolved theme via the icon (sun = light,
 * moon = dark, monitor = system). Uses the shadcn token system so it
 * looks correct against both light and dark TopBars.
 */
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface Props {
  className?: string;
  /** Inverse styling sits on the dark purple TopBar (light-on-purple). */
  variant?: "default" | "inverse";
  /** Fixed icon-only control for page chrome toolbars. */
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

export default function ThemeToggle({ className, variant = "inverse", compact = false }: Props) {
  const { theme, toggleTheme, resolvedTheme } = useTheme();

  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  const label = buildThemeToggleLabel(theme, resolvedTheme);

  return (
    <ShadButton
      type="button"
      variant="chrome"
      size="icon"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      disableAnimations
      className={cn(
        compact
          ? "touch-press hover:scale-[1.05] h-8 w-8 min-w-8 px-0 [&_svg]:size-4"
          : "touch-press hover:scale-[1.05] md:w-auto md:h-7 md:px-2 md:[&_svg]:size-4",
        variant === "inverse"
          ? "chrome-muted chrome-inverse-hover focus-visible:ring-offset-transparent"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
        className,
      )}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </ShadButton>
  );
}
