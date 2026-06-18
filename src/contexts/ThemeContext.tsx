/**
 * ThemeContext — Wireline is "Midnight": a single, dark-only design system.
 *
 * The light/Rich-Cream path has been retired. This provider keeps its original
 * API surface (theme, resolvedTheme, setTheme, toggleTheme) so existing
 * consumers and theme toggles keep compiling, but every value resolves to
 * "dark" and the `.dark` class is always present on `<html>`. Re-introducing a
 * light variant later is a matter of restoring the resolve/apply logic below.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "wireline.theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  // Midnight is dark-only.
  return "dark";
}

function resolveTheme(_theme: Theme): "light" | "dark" {
  return "dark";
}

function applyTheme(_resolved: "light" | "dark"): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const resolvedTheme = resolveTheme(theme);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setThemeState("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage write failed — preference is in-memory only */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    // Dark-only: toggling is a no-op until a light variant is reintroduced.
    setTheme("dark");
  }, [setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "dark",
      resolvedTheme: "dark",
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
