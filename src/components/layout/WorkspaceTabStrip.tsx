import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";

export type WorkspaceTabItem = {
  id: string;
  label: string;
  href?: string;
};

type WorkspaceTabStripProps = {
  tabs: readonly WorkspaceTabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  className?: string;
  density?: "default" | "compact";
  align?: "center" | "start";
};

function tabClassName(active: boolean, density: "default" | "compact") {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40",
    density === "compact" ? "min-h-8 px-2.5 text-xs" : "min-h-[44px] px-4 text-sm",
    active
      ? "bg-primary text-primary-foreground shadow-[var(--wireline-elevation-sm)]"
      : "text-foreground hover:bg-muted",
  );
}

/** Centered workspace tab strip — settings, inbox, training, and operate surfaces. */
export function WorkspaceTabStrip({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  className,
  density = "default",
  align = "center",
}: WorkspaceTabStripProps) {
  const compact = density === "compact";

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "wl-workspace-tabs flex w-full items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        compact ? "min-h-8 gap-1" : "mb-4 min-h-[44px] gap-2 border-b border-border/70 pb-3",
        align === "start" ? "justify-start" : "justify-center",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        if (tab.href) {
          return (
            <Link
              key={tab.id}
              to={tab.href}
              aria-current={active ? "page" : undefined}
              className={tabClassName(active, density)}
            >
              {tab.label}
            </Link>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect?.(tab.id)}
            className={tabClassName(active, density)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
