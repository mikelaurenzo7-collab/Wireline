/**
 * ThemeContext — surfaces the dark/light/system theme preference,
 * persists it to localStorage, and toggles the `.dark` class on
 * `<html>` so the shadcn token system (`--background`, `--card`,
 * `--ring`, …) flips between the Aurora Cream and the dark palette
 * already defined in `src/index.css`.
 *
 * Defaults to "system" so first-paint matches the operator's OS
 * preference; explicit "light"/"dark" choices override it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  /** The user's stored preference ("system" means follow OS). */
  theme: Theme;
  /** The effective theme actually being rendered ("light" | "dark"). */
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "wireline.theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage may be unavailable (private mode, SSR). Fall back to light.
  }
  return "light";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyResolvedTheme(theme: Theme): "light" | "dark" {
  const resolved: "light" | "dark" =
    theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolved] = useState<"light" | "dark">(() =>
    applyResolvedTheme(readStoredTheme()),
  );

  // Re-apply whenever the stored preference changes.
  useEffect(() => {
    setResolved(applyResolvedTheme(theme));
  }, [theme]);

  // When the user is on "system", keep up with OS-level changes.
  useEffect(() => {
    if (
      theme !== "system" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyResolvedTheme("system"));
    // Safari < 14 only supports addListener
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures — preference is in-memory only.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    // Cycle: light → dark → system → light. Operators usually want a
    // simple binary, but keeping "system" reachable makes first-run
    // sensible across team members on different OS palettes.
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }, [theme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Soft fallback — pages rendered outside the provider (tests, storybook)
    // still resolve `useTheme()` without crashing. Mirrors the pattern used
    // by BrandingContext.
    return {
      theme: "system",
      resolvedTheme: systemPrefersDark() ? "dark" : "light",
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
