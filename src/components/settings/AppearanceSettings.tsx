import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "../../contexts/ThemeContext";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";

const OPTIONS: Array<{ id: Theme; label: string; detail: string; icon: typeof Sun }> = [
  {
    id: "dark",
    label: "Ink",
    detail: "Warm dark canvas — default Wireline Letterpress.",
    icon: Moon,
  },
  {
    id: "light",
    label: "Paper",
    detail: "Warm paper surfaces for bright environments.",
    icon: Sun,
  },
  {
    id: "system",
    label: "System",
    detail: "Follow your device appearance.",
    icon: Monitor,
  },
];

export default function AppearanceSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <section className="studio-card p-5 sm:p-6">
      <p className={WL_APP_CLASSES.wiredEyebrow}>Appearance</p>
      <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-xl tracking-[-0.02em] text-foreground">
        Workspace theme
      </h2>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Active: {resolvedTheme === "dark" ? "Ink" : "Paper"}
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map(({ id, label, detail, icon: Icon }) => {
          const selected = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={selected}
              className={`flex min-h-[44px] flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                selected
                  ? "border-primary/35 bg-primary/5"
                  : "border-border bg-card hover:border-primary/25"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon size={16} aria-hidden="true" />
                {label}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{detail}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
