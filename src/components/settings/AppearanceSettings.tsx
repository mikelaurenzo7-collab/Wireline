import { useId } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "../../contexts/ThemeContext";

const OPTIONS = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
] as const satisfies ReadonlyArray<{ id: Theme; label: string; Icon: typeof Sun }>;

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
        {OPTIONS.map(({ id, label, Icon }) => {
          const selected = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={selected}
              className={`inline-flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-lg border px-2 py-3 text-center text-sm font-semibold transition-colors ${
                selected
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-foreground hover:border-primary/25"
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p id={helpId} className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {theme === "system"
          ? "Matches your device’s theme."
          : `${theme === "light" ? "Light" : "Dark"} appearance.`}
      </p>
    </section>
  );
}
