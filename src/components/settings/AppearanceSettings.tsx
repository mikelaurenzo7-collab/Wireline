import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "../../contexts/ThemeContext";

const OPTIONS: Array<{ id: Theme; label: string; detail: string; icon: typeof Sun }> = [
  {
    id: "dark",
    label: "Ink",
    detail: "Letterpress default",
    icon: Moon,
  },
  {
    id: "light",
    label: "Paper",
    detail: "Bright environments",
    icon: Sun,
  },
  {
    id: "system",
    label: "System",
    detail: "Match device",
    icon: Monitor,
  },
];

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
      <p className="wl-eyebrow wl-eyebrow--muted">Theme</p>
      <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-xl tracking-[-0.02em] text-foreground">
        Workspace theme
      </h2>
      <div
        className="mt-5 grid gap-2 sm:grid-cols-3"
        role="group"
        aria-label="Workspace theme"
      >
        {OPTIONS.map(({ id, label, detail, icon: Icon }) => {
          const selected = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={selected}
              className={`flex min-h-[44px] min-w-0 flex-col gap-1 overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors ${
                selected
                  ? "border-primary/35 bg-primary/5"
                  : "border-border bg-background hover:border-primary/25"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon size={16} aria-hidden="true" />
                {label}
              </span>
              <span className="min-w-0 break-words text-xs leading-relaxed text-muted-foreground">
                {detail}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
