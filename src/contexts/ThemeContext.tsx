import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";

/**
 * Wireline currently ships one intentional appearance: the warm light Studio.
 * This compatibility context keeps older shared components harmless while the
 * retired workspace chrome is removed in small, verified passes.
 */
export type Theme = "light";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light";
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme();
  }, []);

  const enforceLight = useCallback(() => {
    applyTheme();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: "light", resolvedTheme: "light", setTheme: enforceLight, toggleTheme: enforceLight }),
    [enforceLight],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  return context ?? {
    theme: "light",
    resolvedTheme: "light",
    setTheme: () => {},
    toggleTheme: () => {},
  };
}
