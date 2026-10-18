import { useId } from "react";

import { useTheme, type Theme } from "../../contexts/ThemeContext";

const OPTIONS: Array<{ id: Theme; label: string }> = [
  {
    id: "dark",
    label: "Dark",
  },
  {
    id: "light",
    label: "Light",
  },
  {
    id: "system",
    label: "System",
  },
];

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const helpId = useId();

  return (
    <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
      <h2 className="font-[var(--wireline-font-family-display)] text-xl tracking-[-0.02em] text-foreground">
        Theme
      </h2>
      <div
        className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,4.5rem),1fr))] gap-2"
        role="group"
        aria-label="Theme"
        aria-describedby={helpId}
      >
        {OPTIONS.map(({ id, label }) => {
          const selected = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={selected}
              className={`min-h-[44px] min-w-0 rounded-lg border px-2 py-3 text-center text-sm font-semibold transition-colors ${
                selected
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/25"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p id={helpId} className="mt-3 text-sm leading-relaxed text-muted-foreground">
        System uses your device’s theme.
      </p>
    </section>
  );
}
