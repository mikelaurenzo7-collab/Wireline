import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";

/**
 * Wireline currently ships one intentional appearance: the warm light Studio.
 * The wider type is retained temporarily because dormant compatibility
 * components still compile in the TypeScript program while being removed.
 */
export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyLight(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyLight();
  }, []);

  const enforceLight = useCallback(() => {
    applyLight();
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
