/**
 * Marketing pages remain light. Authenticated workspaces provide their own
 * scoped Stitch Noir tokens through `.wl-console-surface`.
 *
 * Keep <html> light so a console route never changes public first paint.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyLight(): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyLight();
  }, []);

  const noop = useCallback(() => {
    applyLight();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: "light", resolvedTheme: "light", setTheme: noop, toggleTheme: noop }),
    [noop],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "light",
      resolvedTheme: "light",
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
